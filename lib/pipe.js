
const Q = require('q');
const LinkedMap = require('linked-map');
const InvocationTimeoutError = require('./error/invocation-timeout-error');

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
  this.clearPending();
};

/**
 *
 */
Pipe.prototype.clearPending = function() {
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
 * @param def
 * @private
 */
Pipe.prototype._configureTimeout = function(messageInfo) {
  if (this._options.invocationTimeout && this._options.invocationTimeout !== Infinity) {
    var timer = setTimeout(function() {

      this._options.logger('trace', 'Timed out:', messageInfo.id);

      // Remove the message so it's not processed if it comes in later
      this._pending.remove(messageInfo.id);

      // Reject
      messageInfo.deferred.reject(new InvocationTimeoutError());
    }.bind(this), this._options.invocationTimeout);

    messageInfo.timer = timer;
  }
};

/**
 *
 * @param message
 */
Pipe.prototype.send = function(message) {
  if (!message) return;

  this._options.logger('trace', 'Queueing:', message);

  var def = Q.defer();

  if (this.flushing()) {
    def.reject(new Error('Illegal state: flushing'));
    return def.promise;
  }

  var id = this._nextMessageId++;
  var messageInfo = {
    id: id,
    message: message,
    deferred: def
  };

  this._configureTimeout(messageInfo);
  this._queue.push(id, messageInfo);

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
    var messageInfo = this._queue.shift();
    if (!messageInfo) {
      break;
    }

    this._options.logger('trace', 'Sending:', messageInfo);

    this._pending.push(messageInfo.id, messageInfo);
    this._sender({
      id: messageInfo.id,
      message: messageInfo.message
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
 * @param err
 * @private
 */
Pipe.prototype._deserializeError = function(err) {
  var Type;
  switch (err.type) {
    case 'TypeError': Type = TypeError; break;
    case 'RangeError': Type = RangeError; break;
    case 'EvalError': Type = EvalError; break;
    case 'ReferenceError': Type = ReferenceError; break;
    case 'SyntaxError': Type = SyntaxError; break;
    default: Type = Error; break;
  }

  var e = new Type(err.message);
  e.stack = err.stack;

  return e;
};

/**
 *
 * @returns {function(this:Pipe)}
 */
Pipe.prototype.receiver = function() {
  return function(data) {

    this._options.logger('trace', 'Received:', data);

    // Make sure the queue keeps processing
    if (this.queued()) {
      process.nextTick(this._processQueue.bind(this));
    }

    // Look-up the pending message
    var pendingMessage = this._pending.remove(data.id);

    this._options.logger('trace', 'Pending message:', pendingMessage);

    if (pendingMessage) {
      var def = pendingMessage.deferred;
      clearTimeout(pendingMessage.timer);

      if (data.error) {
        def.reject(this._deserializeError(data.error));
      } else {
        def.resolve(data.message);
      }
    } // else timed out

    this._tryResolveFlush();

  }.bind(this);
};

Pipe.prototype.toString = function() {
  return "Pipe[pending=" + this.pending() +
      ", queued=" + this.queued() +
      ", flushing=" + this.flushing() +
      "]";
};

module.exports = Pipe;
