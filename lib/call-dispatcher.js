"use-strict";
var Pipe = require('./pipe');

/**
 *
 * @param loadStrategy
 * @param atCapacityStrategy
 * @constructor
 */
function CallDispatcher(loadStrategy, atCapacityStrategy, emitter, options) {

  this._loadStrategy = loadStrategy;
  this._atCapacityStrategy = atCapacityStrategy;
  this._emitter = emitter;
  this._options = options;

  this._pipe = this._createPipe();
  this._workerAvailable = this._pipe.receiver();
}

/**
 *
 * @private
 */
CallDispatcher.prototype._createPipe = function() {
  var pipe = new Pipe({
    //maxPending: this._options.maxConcurrentCalls,
    //pendingTimeout: this._options.invocationTimeout,
    maxRetries: 0,
    logger: this._options.logger
  });

  pipe.sender(this._selectWorker.bind(this));

  return pipe;
};

/**
 *
 * @param call
 */
CallDispatcher.prototype.dispatch = function(call) {
  return this._pipe.send(call).then(function(worker) {
    return call.invoke(worker);
  }).catch(function(err) {
    call.deferred.reject(err);
    throw err;
  });
};

/**
 *
 * @private
 */
CallDispatcher.prototype._selectWorker = function(message) {
  if (this._loadStrategy.atCapacity()) {
    return this._handleAtCapacity(message.message);
  }

  return new Promise(function(resolve, reject) {
    this._loadStrategy
      .selectWorker()
      .then(function(worker) {
        if (worker) {
          // Reply to the pipe with the worker
          this._workerAvailable({
            id: message.id,
            message: worker
          });
        } else {
          reject(new Error('Load strategy selected falsey worker'));
        }
      }.bind(this)).catch(function(err) {
      reject(err);
    }.bind(this));
  }.bind(this));
};

/**
 *
 * @param worker May be null
 * @param call
 * @private
 */
CallDispatcher.prototype._handleAtCapacity = function(call) {
  var handled = this._atCapacityStrategy.handle(call);
  if (!handled) {
    this._pipe.paused(true);
    this._pipe.resetPending();

    this._emitter.once("worker:pool:available", function(worker) {
      this._pipe.resetPending();
      this._pipe.paused(false);
    }.bind(this));
  }
};

module.exports = CallDispatcher;
