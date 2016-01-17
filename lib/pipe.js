"use-strict";

var joi = require('joi');
var LinkedMap = require('linked-map');
var whipperUtil = require('./util');
var TimeoutError = require('./error/timeout-error');


var optionsSchema = joi.compile({

  pendingTimeout: joi.number()
    .integer()
    .min(0)
    .allow(Infinity)
    .unit('ms')
    .default(Infinity),

  maxPending: joi.number()
    .integer()
    .min(1)
    .allow(Infinity)
    .unit('messages')
    .default(Infinity),

  maxRetries: joi.number()
    .integer()
    .min(0)
    .allow(Infinity)
    .unit('retries')
    .default(3),

  logger: joi.func()
    .default(function() {})

});

/**
 * A unidirectional pipeline for outgoing messages and receiving replies.
 * A message can be sent through the pipe and must be replied to in order to
 * acknowledge receipt. The pipe is synchronous in that there is only one opportunity for replying to a sent message;
 * it is not known that a message has been successfully delivered until the reply is received.
 * <p>
 * This class in not concerned with the mechanism by which messages are sent and replies are received. The client must
 * supply 'sender' function which handles the actual transport of outgoing messages, and must call a 'receiver' function
 * with returned replies.
 * <p>
 * A pending message is one that has been sent but has not yet been replied to. The pipe will enforce a specified
 * maximum number of pending messages beyond which a message send attempt will be queued until a reply is received
 * for at least one of the pending messages. The message queue may fill up infinitely, and it is up to the client
 * to manage the queue size in relation to the sending of new messages.
 * <p>
 * A pipe can be flushed where no further message deliveries will be accepted until any pending and queued messages
 * have received replies. When the pipe is in the flushing state, a message send attempt will be rejected with a thrown
 * Error.
 *
 * @param {Object} options
 * @param {number} options.pendingTimeout The time duration in milliseconds after which a sent message will time-out
 *           if a response is not received.
 * @param {number} options.maxPending The maximum number of messages awaiting reply that will be allowed at a given time.
 * @param {function} options.logger The optional function that will receive logging messages.
 *
 * @see Pipe.OptionsSchema
 * @constructor
 */
function Pipe(options) {
  options = whipperUtil.validateOptions(options, optionsSchema);

  this._options = options;
  this._nextMessageId = {
    id: 0
  };
  this._queue = new LinkedMap();
  this._pending = new LinkedMap();
  this._paused = false;
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
  return this._pending.size() >= this._options.maxPending;
};

/**
 * Obtain the number of currently pending messages.
 * @returns {number} The number of pending messages.
 */
Pipe.prototype.pending = function() {
  return this._pending.size();
};

/**
 *
 * @param paused
 * @return {boolean|*}
 */
Pipe.prototype.paused = function(paused) {
  if (paused === undefined) {
    return this._paused;
  }
  this._paused = paused;

  if (!paused) {
    this._processQueue();
  }
};

/**
 * Return any pending messages to the front of the queue so that a send will be retried in the future.
 * After this call, there will be no pending messages.
 */
Pipe.prototype.resetPending = function() {
  this._pending.values().reverse().forEach(function(message) {
    message.reset();
  }.bind(this));
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
 * @return {Promise} A promise that will be resolved with the flushing is complete.
 */
Pipe.prototype.flush = function() {
  return new Promise(function(resolve, reject) {
    this._flushDeferral = {
      resolve: resolve,
      reject: reject
    };
    this._tryResolveFlush();
  }.bind(this));
};

/**
 * Check if pending and queued messages have been flushed, and complete the flush if so.
 * @private
 */
Pipe.prototype._tryResolveFlush = function() {
  if (this._flushDeferral && this.pending() === 0 && this.queued() === 0) {
    this._flushDeferral.resolve();
    this._flushDeferral = null;
  }
};

/**
 * Send the given payload through the pipe. If the pipe is in a flushing state, the returned promise is immediately
 * rejected with an Error.
 * @param {*} payload The payload to send.
 * @returns {Promise} A promise that will be resolved with the reply payload object when it is received.
 */
Pipe.prototype.send = function(payload) {
  return new Promise(function(resolve, reject) {
    if (!payload) {
      return reject(new Error("payload parameter is required"));
    }

    this._options.logger('trace', 'Queueing:', payload);

    if (this.flushing()) {
      return reject(new Error('Illegal state: flushing'));
    }

    var message = this._createMessage(payload, {
      resolve: resolve,
      reject: reject
    });
    this._queue.push(message.id(), message);
    this._processQueue();
  }.bind(this));
};

/**
 *
 * @param payload
 * @param deferred {resolve: function, reject: function}
 * @return {Message}
 * @private
 */
Pipe.prototype._createMessage = function(payload, deferred) {
  var message = new Message(this._nextMessageId, payload, deferred, this._options);
  message.onTimeout(this._handleMessageTimeout.bind(this));
  message.onReset(this._handleMessageReset.bind(this));
  message.touch();

  return message;
};

/**
 *
 * @param message
 * @private
 */
Pipe.prototype._handleMessageTimeout = function(message) {
  // Remove the message so it's not processed if the reply comes in later
  this._pending.remove(message.id());
};

/**
 *
 * @param message
 * @param resetResult
 * @private
 */
Pipe.prototype._handleMessageReset = function(message, oldId) {
  // Remove the message from pending
  this._pending.remove(oldId);

  if (!message.failed()) {
    // Reschedule for delivery
    this._queue.unshift(message.id(), message);
    this._processQueue();
  }
};

/**
 *
 * @return {boolean}
 * @private
 */
Pipe.prototype._isProcessingQueue = function() {
  return !this._paused &&
    this._queue.size() > 0 &&
    !this.atMaxPending();
};

/**
 * Try to send queued messages.
 * @private
 */
Pipe.prototype._processQueue = function() {

  this._options.logger('trace', 'Processing queue');

  while (this._isProcessingQueue()) {
    var message = this._queue.shift();
    if (!message) {
      break;
    }

    //this._options.logger('trace', 'Sending:', message);

    message.markTry();
    this._pending.push(message.id(), message);

    var result = this._sender({
      id: message.id(),
      message: message.payload()
    });

    if (result !== undefined) {
      this._handleSendResult(result, message);
    }
  }
};

/**
 *
 * @param result
 * @param message
 * @private
 */
Pipe.prototype._handleSendResult = function(result, message) {

  var handleFailure = function(err) {
    this._options.logger('error', err.message);
    message.retry(err);
  }.bind(this);

  if (result === false) {
    handleFailure(new Error('Failed to send message'));

  } else if (typeof result.catch === 'function') {
    result.catch(function(err) {
      handleFailure(err);
      throw err;
    });

  } else {
    throw new Error('Unknown sender result: ' + result);
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

    //this._options.logger('trace', 'Pending message:', pendingMessage);

    this._handleMessageReply(pendingMessage, data);
    this._tryResolveFlush();

  }.bind(this);
};

/**
 *
 * @param message
 * @param data
 * @private
 */
Pipe.prototype._handleMessageReply = function(message, data) {
  if (message) {
    if (data.error) {
      message.reject(data.error);
    } else {
      message.resolve(data.message);
    }
  } // else timed out
};

/**
 *
 * @return {string}
 */
Pipe.prototype.toString = function() {
  return "Pipe[pending=" + this.pending() +
      ", queued=" + this.queued() +
      ", flushing=" + this.flushing() +
      "]";
};

/**
 *
 * @param idSource
 * @param payload
 * @param options
 * @constructor
 */
function Message(idSource, payload, deferred, options) {
  this._idSource = idSource;
  this._payload = payload;
  this._deferred = deferred;
  this._options = options;
  this._tries = 0;

  this.nextId();
}

/**
 *
 * @return {*}
 */
Message.prototype.id = function() {
  return this._id;
};

/**
 *
 * @return {*}
 */
Message.prototype.payload = function() {
  return this._payload;
};

/**
 *
 * @param cb
 */
Message.prototype.onTimeout = function(cb) {
  this._onTimeout = cb;
};

/**
 *
 * @param cb
 */
Message.prototype.onReset = function(cb) {
  this._onReset = cb;
};

/**
 *
 */
Message.prototype.nextId = function() {
  this._id = this._idSource.id++;
};

/**
 *
 */
Message.prototype.failed = function() {
  return !!this._failed;
};

/**
 *
 * @param result
 */
Message.prototype.resolve = function(result) {
  clearTimeout(this._timer);
  this._deferred.resolve(result);
};

/**
 *
 * @param err
 */
Message.prototype.reject = function(err) {
  clearTimeout(this._timer);
  this._failed = true;
  this._deferred.reject(err);
};

/**
 * Setup the timer that will reject the message promise if it times-out.
 * @param messageInfo The message to configure.
 * @private
 */
Message.prototype.touch = function() {
  if (this._options.pendingTimeout && this._options.pendingTimeout !== Infinity) {

    clearTimeout(this._timer);

    this._timer = setTimeout(function() {
      this._options.logger('trace', 'Timed out:', this.id);
      this._onTimeout(this);
      this.reject(new TimeoutError());
    }.bind(this), this._options.pendingTimeout);
  }
};

/**
 *
 */
Message.prototype.markTry = function() {
  this._tries++;
};

/**
 *
 */
Message.prototype.retry = function(cause) {
  if (this._tries > this._options.maxRetries) {
    this.reject(cause || new Error("Maximum send retries exceeded"));
  }
  this.reset();
};

/**
 *
 */
Message.prototype.reset = function() {
  // Obtain a new id so that there are no conflicts with possible replies for the previous send attempt.
  var oldId = this._id;
  this.nextId();

  // Touch inactivity timer
  this.touch();

  this._onReset(this, oldId);
};

/**
 *
 * @return {string}
 */
Message.prototype.toString = function() {
  return "Message[id=" + this.id() +
    ",payload=" + this.payload() +
    ",tries=" + this._tries +
    "]";
};

module.exports = Pipe;
