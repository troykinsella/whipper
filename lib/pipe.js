const joi = require('joi');
const Q = require('q');
const LinkedMap = require('linked-map');
const whipperUtil = require('./util');
const TimeoutError = require('./error/timeout-error');


/**
 * Pipe options schema
 */
const optionsSchema = joi.compile({

  /**
   * The time duration in milliseconds after which a sent message will time-out
   * if a response is not received.
   */
  pendingTimeout: joi.number().integer().min(0).allow(Infinity).unit('ms'),

  /**
   * The maximum number of messages awaiting reply that will be allowed at a given time.
   */
  maxPending: joi.number().integer().min(1).allow(Infinity).unit('messages'),

  /**
   * The optional function that will receive logging messages.
   */
  logger: joi.func()

});

/**
 * Pipe option default values.
 */
const optionDefaults = {
  pendingTimeout: Infinity,
  maxPending: Infinity,
  logger: function() {}
};

/**
 * A unidirectional pipeline for outgoing messages and receiving replies.
 * A message can be sent through the pipe and must be replied to in order to
 * acknowledge receipt. The pipe is synchronous in that there is only one opportunity for replying to a sent message;
 * it is not known that a message has been successfully delivered until the reply is received.
 *
 * This class in not concerned with the mechanism by which messages are sent and replies are received. The client must
 * supply 'sender' function which handles the actual transport of outgoing messages, and must call a 'receiver' function
 * with returned replies.
 *
 * A pending message is one that has been sent but has not yet been replied to. The pipe will enforce a specified
 * maximum number of pending messages beyond which a message send attempt will be queued until a reply is received
 * for at least one of the pending messages. The message queue may fill up infinitely, and it is up to the client
 * to manage the queue size in relation to the sending of new messages.
 *
 * A pipe can be flushed where no further message deliveries will be accepted until any pending and queued messages
 * have received replies. When the pipe is in the flushing state, a message send attempt will be rejected with a thrown
 * Error.
 *
 * @param options
 * @constructor
 */
function Pipe(options) {
  options = whipperUtil.normalizeOptions(options, optionsSchema, optionDefaults);

  this._options = options;
  this._nextMessageId = 0;
  this._queue = new LinkedMap();
  this._pending = new LinkedMap();
}

/**
 * Determine if there are no pending or queued messages.
 * @return {boolean} <code>true</code> if no messages are pending or queued.
 */
Pipe.prototype.isIdle = function() {
  return this._pending.size() === 0 && this._queue.size() === 0;
};


/**
 * The maximum number of messages, according to the 'maxPending' option, are currently pending.
 * @return {boolean} <code>true</code> if the number of pending messages is equal to the maximum allowed.
 */
Pipe.prototype.atMaxPending = function() {
  return this._pending.size() >= this._options.maxPending
};

/**
 * Obtain the number of currently pending messages.
 * @returns {number} The number of pending messages.
 */
Pipe.prototype.pending = function() {
  return this._pending.size();
};

/**
 * Put any pending messages at the end of the queue so that a send will be retried in the future.
 * After this call, there will be no pending messages.
 */
Pipe.prototype.resetPending = function() {
  this._pending.each(function(id, message) {
    // Obtain a new id so that there are no conflicts with possible replies for the previous send attempt.
    id = this._nextMessageId++;
    message.id = id;
    this._queue.push(id, message);
  }.bind(this));
  this.clearPending();
};

/**
 * Clear the set of pending messages that are expecting replies. If a reply for message
 * that has been cleared is received, it is ignored.
 */
Pipe.prototype.clearPending = function() {
  this._pending.clear();
};

/**
 * Obtain the number of currently queued messages.
 * @return {number} The number of queued messages.
 */
Pipe.prototype.queued = function() {
  return this._queue.size();
};

/**
 * Determine if the pipe is flushing pending and queued messages.
 * @return {boolean} <code>true</code> if the pipe is flushing.
 */
Pipe.prototype.flushing = function() {
  return !!this._flushDeferral;
};

/**
 * Flush any pending and queued messages.
 * @return {promise} A promise that will be resolved with the flushing is complete.
 */
Pipe.prototype.flush = function() {
  var def = this._flushDeferral || Q.defer();
  this._flushDeferral = def;
  this._tryResolveFlush();
  return def.promise;
};

/**
 * Check if pending and queued messages have been flushed, and complete the flush if so.
 * @private
 */
Pipe.prototype._tryResolveFlush = function() {
  if (this._flushDeferral && this.pending() == 0 && this.queued() == 0) {
    this._flushDeferral.resolve();
    this._flushDeferral = null;
  }
};

/**
 * Setup the timer that will reject the message promise if it times-out.
 * @param messageInfo The message to configure.
 * @private
 */
Pipe.prototype._configureTimeout = function(messageInfo) {
  if (this._options.pendingTimeout && this._options.pendingTimeout !== Infinity) {
    var timer = setTimeout(function() {

      this._options.logger('trace', 'Timed out:', messageInfo.id);

      // Remove the message so it's not processed if it comes in later
      this._pending.remove(messageInfo.id);

      // Reject
      messageInfo.deferred.reject(new TimeoutError());
    }.bind(this), this._options.pendingTimeout);

    messageInfo.timer = timer;
  }
};

/**
 * Send the given message through the pipe. If the pipe is in a flushing state, the returned promise is immediately
 * rejected with an Error.
 * @param {*} message The message to send.
 * @returns {promise} A promise that will be resolved with the message reply object when it is received.
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
 * Try to send queued messages.
 * @private
 */
Pipe.prototype._processQueue = function() {

  this._options.logger('trace', 'Processing queue');

  while (this._queue.size() > 0 && !this.atMaxPending()) {
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
 * Set the function that will be called with messages to be sent. This must be called
 * prior to sending any messages.
 * @param {function} sender
 */
Pipe.prototype.sender = function(sender) {
  this._sender = sender;
};

/**
 * TODO: This doesn't really belong here.
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
 * Obtain the function that receives message replies.
 * @returns {function(this:Pipe)} A function that can be called with replies to messages.
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
