/**
 *
 * @constructor
 */
function QueueStrategy(emitter, options) {

  this._emitter = emitter;
  this._options = options; // TODO: normalize

  this._queue = [];


};

/**
 *
 * @private
 */
QueueStrategy.prototype._processQueue = function() {
  var queue = this._queue;
  var workerPromise;
  while (queue.length) {
    workerPromise = workers.selectWorker();
    if (!workerPromise) {
      break;
    }
    var msg = queue.shift();
    workerPromise.then(function() {
      worker.invoke(msg.method, msg.args, msg.callback);
    });
  }

};

/**
 *
 * @param invocation
 */
QueueStrategy.prototype.handle = function(method, args) {
  this._queue.push({
    method: method,
    args: args
  });
  this._processQueue();
};

module.exports = QueueStrategy;
