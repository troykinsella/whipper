
const Q = require('q');
const LinkedMap = require('linked-map');

/**
 *
 * @param options
 * @constructor
 */
function Pipe(options) {
  this._nextMessageId = 0;
  this._queue = new LinkedMap();
  this._pending = new LinkedMap();
  this._options = options;

  this._options.logger = this._options.logger || function() {};
}

/**
 *
 * @return {boolean}
 */
Pipe.prototype.atCapacity = function() {
  return this._pending.size() >= this._options.maxPending
};

/**
 *
 * @returns {*|number}
 */
Pipe.prototype.pending = function() {
  return this._pending.size();
};

/**
 *
 */
Pipe.prototype.resetPending = function() {
  this._pending.each(function(id, message) {
    this._queue.push(id, message);
  }.bind(this));
  this._pending.clear();
};

/**
 *
 * @return {*|number}
 */
Pipe.prototype.queued = function() {
  return this._queue.size();
};

/**
 *
 * @return {boolean}
 */
Pipe.prototype.flushing = function() {
  return !!this._flushDeferral;
};

/**
 *
 */
Pipe.prototype.flush = function() {
  var def = this._flushDeferral || Q.defer();
  this._flushDeferral = def;
  this._tryResolveFlush();
  return def.promise;
};

/**
 *
 * @private
 */
Pipe.prototype._tryResolveFlush = function() {
  if (this._flushDeferral && this.pending() == 0 && this.queued() == 0) {
    this._flushDeferral.resolve();
    this._flushDeferral = null;
  }
};

/**
 *
 * @param message
 */
Pipe.prototype.send = function(message) {
  if (!message) return;

  this._options.logger('trace', 'Queueing: ', message);

  var def = Q.defer();

  if (this.flushing()) {
    def.reject(new Error('Illegal state: flushing'));
    def.promise;
  }

  var id = this._nextMessageId++;
  this._queue.push(id, {
    id: id,
    message: message,
    deferred: def
  });

  this._processQueue();
  return def.promise;
};

/**
 *
 * @private
 */
Pipe.prototype._processQueue = function() {

  this._options.logger('trace', 'Processing queue');

  while (this._queue.size() > 0 && !this.atCapacity()) {
    var message = this._queue.shift();
    if (!message) {
      break;
    }

    this._options.logger('trace', 'Sending: ', message);

    this._pending.push(message.id, message);
    this._sender({
      id: message.id,
      message: message.message
    });
  }
};

/**
 *
 * @param sender
 */
Pipe.prototype.sender = function(sender) {
  this._sender = sender;
};

/**
 *
 * @returns {function(this:Pipe)}
 */
Pipe.prototype.receiver = function() {
  return function(data) {

    this._options.logger('trace', 'Received: ', data);

    // Make sure the queue keeps processing
    if (this.queued()) {
      process.nextTick(this._processQueue.bind(this));
    }

    // Look-up the pending message
    var pendingMessage = this._pending.remove(data.id);

    this._options.logger('trace', 'Pending message: ', pendingMessage);

    this._tryResolveFlush();

    if (pendingMessage) {
      pendingMessage.deferred.resolve(data.message);
    } else {
      pendingMessage.deferred.reject(new Error("Illegal state: pending message not found. Message id: " + data.id));
    }

  }.bind(this);
};

module.exports = Pipe;
