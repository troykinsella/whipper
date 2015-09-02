
const _ = require('lodash');
const Q = require('q');
const EventEmitter = require('events').EventEmitter;
const util = require('util');
const joi = require('joi');
const WorkerPool = require('./worker-pool');
const WorkerHandle = require('./worker-handle');
const WorkerProxy = require('./worker-proxy');
const BasicLoadStrategy = require('./load-strategy/basic');

/**
 * Whipper options
 */
const optionsSchema = joi.compile({
  /**
   * The resolved path to the worker module file.
   */
  workerModulePath: joi.string().required(),

  /**
   * The time duration in milliseconds since the last call processed after which a worker will be reclaimed.
   */
  inactivityTimeout: joi.number().integer().min(0).allow(Infinity).unit('ms'),

  /**
   * The time duration in milliseconds after which an initiated call to a worker will time-out
   * if a response is not received.
   */
  invocationTimeout: joi.number().integer().min(0).allow(Infinity).unit('ms'),

  /**
   * When a worker is flushing, it will temporarily stop accepting new calls, and await completion of any
   * queued or pending calls. If the flush takes longer than this time period in milliseconds
   * a graceful kill will be attempted.
   */
  flushTimeout: joi.number().integer().min(0).unit('ms'),

  /**
   * When a worker process is asked to die gracefully, if it has not completed its work and died after
   * this amount of time in milliseconds, a SIGKILL will be issued to kill it forcefully.
   */
  forceKillTimeout: joi.number().integer().min(0).unit('ms'),

  /**
   * The maximum number of concurrent calls a single worker will be allowed to process at a given time.
   */
  maxConcurrentCallsPerWorker: joi.number().integer().min(1).allow(Infinity),

  /**
   * The maximum number of calls total over time that a single worker can handle before the child process
   * is killed and forked anew. This is useful as a quick band-aid for memory leaks.
   */
  maxTotalCallsPerWorker: joi.number().integer().min(1).allow(Infinity).max(joi.ref('maxCallsPerWorker')),

  /**
   *
   */
  loadStrategy: joi.alternatives().try(joi.string().valid('basic'), joi.func()),

  /**
   *
   */
  atCapacityStrategy: joi.alternatives().try(joi.string().valid('queue', 'drop'), joi.func()),

  /**
   *
   */
  logger: joi.func()
});

const optionDefaults = {
  inactivityTimeout: Infinity,
  flushTimeout: 5000,
  forceKillTimeout: 5000,
  maxConcurrentCallsPerWorker: Infinity,
  maxTotalCallsPerWorker: Infinity,
  loadStrategy: "basic",
  atCapacityStrategy: "queue",
  logger: function() {}
};

function validateOptions(o) {
  var optionsResult = joi.validate(o, optionsSchema);
  if (optionsResult.error) {
    throw optionsResult.error;
  }
  return o;
}

function normalizeOptions(o) {
  o = _.extend({}, optionDefaults, o);
  return validateOptions(o);
}

/**
 *
 * @param options
 * @constructor
 */
function Whipper(options) {
  EventEmitter.call(this);

  options = normalizeOptions(options);
  this._options = options;

  this._workerPool = this._createWorkerPool();
  this._loadStrategy = this._createLoadStrategy();
  this._atCapacityStrategy = this._createAtCapacityStrategy();






  /**
   *
   */
  const discoverWorkerInterface = function() {
    var worker = this.selectWorker();
    worker.discoverInterface(function(iface) {
      console.log("Discovered interface: ", iface);
      workerInterface = iface.sort();
      emitter.emit("worker:interface", workerInterface);
    });
  }.bind(this);

  /**
   *
   * @param callback
   * @returns {Promise}
   */
  this.getWorkerInterface = function() {
    var def = Q.defer();
    if (workerInterface) {
      def.resolve(workerInterface);
    } else {
      discoverWorkerInterface();
      emitter.once("worker:interface", function(iface) {
        def.resolve(iface);
      });
    }
    return def.promise;
  };

  /**
   *
   */
  this.totalWorkers = function() {

  };

  /**
   *
   */
  this.idleWorkers = function() {

  };

  /**
   *
   */
  this.busyWorkers = function() {

  };

  /**
   *
   */
  this.killAll = function() {

  };

  /**
   *
   * @param force
   */
  this.shutdown = function(force) {



  };
}
util.inherits(Whipper, EventEmitter);

Whipper.Worker = WorkerHandle;

/**
 *
 * @private
 */
Whipper.prototype._createWorkerPool = function() {
  return new WorkerPool(this, this._options);
};

/**
 *
 * @private
 */
Whipper.prototype._createLoadStrategy = function() {
  var result;
  switch (this._options.loadStrategy) {
    case 'basic':
      result = new BasicLoadStrategy(this._workerPool, this._options);
      break;
  }

  if (typeof this._options.loadStrategy === 'function') {
    result = this._options.loadStrategy(this._workerPool, this._options);
  }

  if (!result) {
    throw new Error("Invalid load strategy: " + this._options.loadStrategy);
  }
  return result;
};

/**
 *
 * @private
 */
Whipper.prototype._createAtCapacityStrategy = function() {
  var result;
  switch (this._options.atCapacityStrategy) {
    case 'drop':
    case 'error':
    case 'queue':
      result = new (require('./at-capacity-strategy/' + this._options.atCapacityStrategy))();
      break;
  }

  if (typeof this._options.atCapacityStrategy === 'function') {
    result = this._options.atCapacityStrategy();
  }

  if (!result) {
    throw new Error("Invalid at-capacity strategy: " + this._options.atCapacityStrategy);
  }

  return result;
};

Whipper.prototype.workerProxy = function() {
  var def = Q.defer();
  workers.getWorkerInterface(function(iface) {
    var proxy = new WorkerProxy(iface, this.invoke.bind(this));
    def.resolve(proxy);
  }.bind(this));
  return def.promise;
};

/**
 *
 * @param method
 * @param args
 * @param callback
 */
Whipper.prototype.invoke = function(method, args, callback) {
  var worker = this._loadStrategy.selectWorker();
  if (!worker) {
    this._atCapacityStategy.handle(worker);
  } else {

  }



  queue.push({
    method: method,
    args: args,
    callback: callback
  });

  process.nextTick(processQueue);
};


module.exports = Whipper;
