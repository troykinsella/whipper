
const _ = require('lodash');
const deferred = require('deferred');
const EventEmitter = require('events').EventEmitter;
const util = require('util');
const joi = require('joi');
const WorkerManager = require('./worker-manager');
const WorkerProxy = require('./worker-proxy');

/**
 * Whipper options
 */
const optionsSchema = joi.compile({
  /**
   * The resolved path to the worker module file.
   */
  workerModulePath: joi.string().required(),

  /**
   * The minimum number of workers that will be maintained.
   */
  minWorkers: joi.number().integer().min(1),

  /**
   * The maximum number of workers that will be maintained.
   */
  maxWorkers: joi.number().integer().min(joi.ref('minWorkers')),

  /**
   * The time duration in milliseconds since the last call processed after which a worker will be reclaimed.
   */
  inactivityTimeout: joi.number().integer().min(0).allow(Infinity).unit('ms'),

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
  atCapacityPolicy: joi.alternatives().try(joi.string().valid('queue', 'drop'), joi.func()),

  /**
   *
   */
  logger: joi.func()
});

const optionDefaults = {
  minWorkers: 1,
  maxWorkers: require('os').cpus().length,
  inactivityTimeout: Infinity,
  flushTimeout: 5000,
  forceKillTimeout: 5000,
  maxConcurrentCallsPerWorker: Infinity,
  maxTotalCallsPerWorker: Infinity,
  atCapacityPolicy: "queue",
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

  const workers = new WorkerManager(this, options);
  const queue = [];

  /**
   *
   * @type {function(this:Whipper)}
   */
  const processQueue = function() {
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
  }.bind(this);

  /**
   *
   * @param method
   * @param args
   * @param callback
   */
  this.invoke = function(method, args, callback) {
    queue.push({
      method: method,
      args: args,
      callback: callback
    });

    process.nextTick(processQueue);
  };

  /**
   *
   * @returns {*}
   */
  this.workerProxy = function() {
    var def = deferred();
    workers.getWorkerInterface(function(iface) {
      var proxy = new WorkerProxy(iface, this.invoke.bind(this));
      def.resolve(proxy);
    }.bind(this));
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

module.exports = Whipper;
