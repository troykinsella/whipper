
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

  this._workersByStatus = {};
  Object.keys(WorkerHandle.WorkingStatus).forEach(function(s) {
    this._workersByStatus[s] = new LinkedMap();
  }.bind(this));

  this._configureEvents();
}

/**
 *
 * @param worker
 * @private
 */
WorkerPool.prototype._mapWorker = function(worker) {
  var id = worker.id();
  var status = worker.workingStatus();
  var wasAvailable = this.availableWorkerCount() > 0;

  // Update _workersByStatus maps
  Object.keys(WorkerHandle.WorkingStatus).forEach(function(s) {
    if (status === s) {
      this._workersByStatus[s].push(id, worker);
    } else {
      this._workersByStatus[s].remove(id);
    }
  }.bind(this));

  this._emitAvailabilityEvent(worker, wasAvailable);
};

/**
 *
 * @param worker
 * @private
 */
WorkerPool.prototype._unmapWorker = function(worker) {
  var id = worker.id();
  var wasAvailable = this.availableWorkerCount() > 0;

  Object.keys(this._workersByStatus).forEach(function(status) {
    this._workersByStatus[status].remove(id);
  }.bind(this));

  this._emitAvailabilityEvent(worker, wasAvailable);
};

/**
 *
 * @param worker
 * @param wasAvailable
 * @private
 */
WorkerPool.prototype._emitAvailabilityEvent = function(worker, wasAvailable) {
  var nowAvailable = this.availableWorkerCount() > 0;
  if (wasAvailable) {
    if (!nowAvailable) {
      this._emitter.emit("worker:pool:unavailable");
    }
  } else {
    if (nowAvailable) {
      this._emitter.emit("worker:pool:available", worker);
    }
  }
};

/**
 *
 * @param worker
 * @private
 */
WorkerPool.prototype._handleWorkerStateChange = function(worker) {
  var S = WorkerHandle.State;
  switch (worker.state()) {
    case S.created:
    case S.forking:
      // Ignore
      break;

    case S.processing:
      this._mapWorker(worker);
      break;

    case S.flushing:
    case S.dying:
      this._unmapWorker(worker);
      break;

    case S.destroying:
      this._handleWorkerDeath(worker);
      break;

    default:
      // wtf
  }

};

/**
 *
 * @param worker
 * @private
 */
WorkerPool.prototype._handleWorkerDeath = function(worker) {
  this._workers.remove(worker.id());
  this._unmapWorker(worker);

  if (this._options.logger) {
    this._options.logger('info', worker.toString(), ': removed from pool');
  }
};

/**
 *
 * @private
 */
WorkerPool.prototype._configureEvents = function() {

  this._emitter.on("worker:working-status:changed", function(worker) {
    this._mapWorker(worker);
  }.bind(this));

  this._emitter.on("worker:state:changed", function(worker) {
    this._handleWorkerStateChange(worker);
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
 * @return {LinkedMap}
 */
WorkerPool.prototype.allWorkers = function() {
  return this._workers.immutableView();
};

/**
 *
 * @return {LinkedMap}
 */
WorkerPool.prototype.idleWorkers = function() {
  return this._workersByStatus[WorkerHandle.WorkingStatus.idle].immutableView();
};

/**
 *
 * @return {WorkerHandle|null}
 */
WorkerPool.prototype.idleWorker = function() {
  return this._workersByStatus[WorkerHandle.WorkingStatus.idle].head();
};

/**
 *
 * @return {LinkedMap}
 */
WorkerPool.prototype.busyWorkers = function() {
  return this._workersByStatus[WorkerHandle.WorkingStatus.busy].immutableView();
};

/**
 *
 * @return {WorkerHandle|null}
 */
WorkerPool.prototype.busyWorker = function() {
  return this._workersByStatus[WorkerHandle.WorkingStatus.busy].head();
};

/**
 *
 * @return {LinkedMap}
 */
WorkerPool.prototype.atCapacityWorkers = function() {
  return this._workersByStatus[WorkerHandle.WorkingStatus.atCapacity].immutableView();
};

/**
 *
 * @return {number}
 */
WorkerPool.prototype.availableWorkerCount = function() {
  return this._workersByStatus[WorkerHandle.WorkingStatus.idle].size() +
    this._workersByStatus[WorkerHandle.WorkingStatus.busy].size();
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
    worker = this.idleWorker() || this.busyWorker() || this._workers.head();
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
  this._workers.values().forEach(function(worker) {
    promise = worker.kill(force, true);
    promises.push(promise);
  });
  return Q.all(promises);
};


module.exports = WorkerPool;
