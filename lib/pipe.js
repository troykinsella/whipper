
const deferred = require('deferred');
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
  var def = this._flushDeferral || deferred();
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

  //this._options.logger('debug', 'Queueing: ', message);

  var def = deferred();

  if (this.flushing()) {
    return def.reject(new Error('Illegal state: flushing'));
  }

  var id = this._nextMessageId++;
  this._queue.push(id, {
    id: id,
    message: message,
    def: def
  });

  this._processQueue();
  return def.promise;
};

/**
 *
 * @private
 */
Pipe.prototype._processQueue = function() {

  console.log("Processing queue");

  //this._options.logger('debug', 'Processing queue');

  while (this._queue.size() > 0 && !this.atCapacity()) {
    var message = this._queue.shift();
    if (!message) {
      break;
    }

    //this._options.logger('debug', 'Sending: ', message);

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

    //this._options.logger('debug', 'Received: ', data);

    // Make sure the queue keeps processing
    if (this.queued()) {
      process.nextTick(this._processQueue.bind(this));
    }

    // Look-up the pending message
    var pendingMessage = this._pending.remove(data.id);

    //this._options.logger('debug', 'Pending message: ', pendingMessage);

    this._tryResolveFlush();

    if (pendingMessage) {
      pendingMessage.def.resolve(data.message);
    } else {
      pendingMessage.def.reject(new Error("Illegal state: pending message not found. Message id: " + data.id));
    }

  }.bind(this);
};

module.exports = Pipe;
