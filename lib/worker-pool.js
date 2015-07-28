
const Q = require('q');
const LinkedMap = require('linked-map');
const WorkerHandle = require('./worker-handle');

/**
 *
 * @constructor
 */
function WorkerPool(emitter, options) {

  this._emitter = emitter;
  this._options = options;

  this._workers = new LinkedMap();
  this._nextWorkerId = 0;

  this._availableWorkers = new LinkedMap();
  this._unavailableWorkers = new LinkedMap();

  this._configureEvents();
}

/**
 *
 * @param worker
 * @private
 */
WorkerPool.prototype._updateWorkerAvailability = function(worker) {
  var id = worker.id();

  if (worker.isAvailable()) {
    this._unavailableWorkers.remove(id);
    this._availableWorkers.push(id, worker);

    if (this._availableWorkers.size() === 1) {
      this._emitter.emit("worker:pool:available", worker);
    }
  } else {
    this._availableWorkers.remove(id);
    this._unavailableWorkers.push(id, worker);

    if (this._availableWorkers.size() === 0) {
      this._emitter.emit("worker:pool:unavailable");
    }
  }
};

/**
 *
 * @param worker
 * @private
 */
WorkerPool.prototype._handleWorkerDeath = function(worker) {
  this._workers.remove(worker.id());
  this._availableWorkers.remove(worker.id());

  if (this._options.logger) {
    this._options.logger('info', worker.toString(), ': removed from pool');
  }
};

/**
 *
 * @private
 */
WorkerPool.prototype._configureEvents = function() {

  this._emitter.on("worker:availability:changed", function(worker) {
    this._updateWorkerAvailability(worker);
  }.bind(this));

  this._emitter.on("worker:state:destroying", function(worker) {
    this._handleWorkerDeath(worker);
  }.bind(this));

};

/**
 *
 * @type {function(this:Whipper)}
 * @private
 */
WorkerPool.prototype._createWorker = function(id) {
  return new WorkerHandle(id, this._emitter, this._options);
};

/**
 *
 * @return {number}
 */
WorkerPool.prototype.workerCount = function() {
  return this._workers.size();
};

/**
 *
 * @return {Array}
 */
WorkerPool.prototype.allWorkers = function() {
  return this._workers.values();
};

/**
 *
 * @return {Array}
 */
WorkerPool.prototype.availableWorkers = function() {
  return this._availableWorkers.values();
};

/**
 *
 * @return {number}
 */
WorkerPool.prototype.availableWorkerCount = function() {
  return this._availableWorkers.size();
};

/**
 *
 * @return {Array}
 */
WorkerPool.prototype.unavailableWorkers = function() {
  return this._unavailableWorkers.values();
};

/**
 *
 * @return {number}
 */
WorkerPool.prototype.unavailableWorkerCount = function() {
  return this._unavailableWorkers.size();
};

/**
 *
 * @type {function(this:Whipper)}
 */
WorkerPool.prototype.addWorker = function() {
  var worker = this._createWorker(this._nextWorkerId++);
  this._workers.push(worker.id(), worker);

  if (this._options.logger) {
    this._options.logger('info', worker.toString(), ': added to pool');
  }

  return worker.fork();
};

/**
 *
 * @param count {number} The minimum number of workers.
 * @return {Promise}
 */
WorkerPool.prototype.ensureMinimumWorkers = function(count) {
  var promises = [],
    promise;
  while (this.workerCount() < count) {
    promise = this.addWorker();
    promises.push(promise);
  }
  return Q.all(promises);
};

/**
 *
 * @param worker The optional worker to be removed. Left unspecified, an arbitrary worker is selected.
 */
WorkerPool.prototype.removeWorker = function(worker, force) {
  if (!worker) {
    worker = this._availableWorkers.head() || this._workers.head();
  }
  if (worker) {
    return worker.kill(force, true);
  }

  var def = Q.defer();
  def.reject(false);
  return def.promise;
};



/**
 *
 * @param count
 */
WorkerPool.prototype.ensureMaximumWorkers = function(count, force) {
  var promises = [],
    promise;
  while (this.workerCount() > count) {
    promise = this.removeWorker(null,  force);
    promises.push(promise);
  }
  return Q.all(promises);
};

/**
 *
 */
WorkerPool.prototype.shutdown = function(force) {
  var promises = [],
    promise;
  this._workers.each(function(id, worker) {
    promise = worker.kill(force, true);
    promises.push(promise);
  });
  return Q.all(promises);
};


module.exports = WorkerPool;
