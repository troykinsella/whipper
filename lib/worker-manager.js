
const Q = require('q');
const LinkedMap = require('linked-map');
const WorkerHandle = require('./worker-handle');

/**
 *
 * @constructor
 */
function WorkerManager(emitter, options) {

  const workers = new LinkedMap();
  var nextWorkerId = 0;

  const availableWorkers = new LinkedMap();


  var workerInterface;
  var lastActiveWorkerId;

  /**
   *
   * @param worker
   */
  const updateWorkerAvailability = function(worker) {
    console.log("AVAIL: ", worker.isAvailable());
    if (worker.isAvailable()) {
      availableWorkers.push(worker.id(), worker);
    } else {
      availableWorkers.remove(worker.id());
    }
  };

  /**
   *
   */
  const configureEvents = function() {

    emitter.on("worker:availability:changed", function(worker) {
      updateWorkerAvailability(worker);
    });

    emitter.on("worker:state:destroying", function(worker) {
      options.logger('debug', worker + ': state changed');
      workers.remove(worker.id());
      availableWorkers.remove(worker.id());
    });

  };


  /**
   *
   * @type {function(this:Whipper)}
   */
  const createWorker = function(id) {
    var worker = new WorkerHandle(id, emitter, options);
    return worker;
  }.bind(this);

  /**
   *
   * @return {boolean}
   */
  const canAddWorker = function() {
    return workers.size() < options.maxWorkers;
  };

  /**
   *
   * @type {function(this:Whipper)}
   */
  const addWorker = function() {
    var worker = createWorker(nextWorkerId++);
    var promise = worker.fork();
    workers.push(worker.id(), worker);
    //availableWorkers.push(worker.id(), worker);

    options.logger('info', worker + ': added');

    return promise;
  }.bind(this);

  /**
   *
   */
  const ensureMinimumWorkers = function() {
    while (workers.size() < options.minWorkers) {
      addWorker();
    }
  }.bind(this);

  /**
   *
   */
  const discoverWorkerInterface = function() {
    workers.head().discoverInterface(function(iface) {
      console.log("Discovered interface: ", iface);
      workerInterface = iface.sort();
      emitter.emit("worker:interface", workerInterface);
    });
  }.bind(this);

  /**
   *
   * @type {function(this:Whipper)}
   */
  const initWorkers = function() {
    var i,
        promises = [],
        promise;
    for (i = 0; i < options.minWorkers; i++) {
      promise = addWorker();

      // On the first worker, discover the interface
      /*if (i == 0) {
        lastActiveWorkerId = availableWorkers.head().id();
        promise.then(discoverWorkerInterface);
      }*/

      promises.push(promise);
    }

    Q.all(promises).then(function() {
      options.logger('info', 'Initial workers ready');
      emitter.emit("workers:ready");
    });
  }.bind(this);


  /**
   *
   * @param callback
   * @returns {*}
   */
  this.getWorkerInterface = function(callback) {
    if (workerInterface) {
      return callback(workerInterface);
    }
    emitter.once("worker:interface", function(iface) {
      callback(iface);
    });
  };


  /**
   *
   */
  const nextAvailableWorker = function() {
    var worker = availableWorkers.next(lastActiveWorkerId, true);
    if (!worker) { // lastActiveWorkerId was probably killed
      worker = availableWorkers.head();
    }
    if (worker) {
      lastActiveWorkerId = worker.id();
    }

    return worker;
  };

  /**
   *
   * @returns {*}
   */
  this.selectWorker = function() {
    var result;
    ensureMinimumWorkers();

    var worker = nextAvailableWorker();
    if (worker) {
      var def = Q.defer();
      def.resolve(worker);
      result = def.promise;
    } else if (canAddWorker()) {
      result = addWorker();
    }

    return result;
  }.bind(this);

  this.workerCount = function() {
    return workers.size();
  };

  this.allWorkers = function() {
    return workers.values();
  };

  configureEvents();
  process.nextTick(initWorkers);
}

module.exports = WorkerManager;
