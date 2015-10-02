"use-strict";

const Pipe = require('./pipe');

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
  this._pipe.send(call).then(function(worker) {
    call.invoke(worker);
  });
};

/**
 *
 * @private
 */
CallDispatcher.prototype._selectWorker = function(message) {
  if (this._loadStrategy.atCapacity()) {
    return this._handleAtCapacity();
  }

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
        console.log("NOT SUPPOSED TO HAPPEN");
      }
    }.bind(this)).fail(function(err) {
      console.log(err.stack); // TODO
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
      this._pipe.paused(false);
    }.bind(this));
  }
};

module.exports = CallDispatcher;
