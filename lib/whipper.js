
const _ = require('lodash');
const Q = require('q');
const EventEmitter = require('events').EventEmitter;
const util = require('util');
const whipperUtil = require('./util');
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
  loadStrategy: "basic",
  atCapacityStrategy: "queue",
  logger: function() {}
};

/**
 *
 * @param options
 * @constructor
 */
function Whipper(options) {
  EventEmitter.call(this);

  options = whipperUtil.normalizeOptions(options, optionsSchema, optionDefaults);
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
      result = new (require('./at-capacity-strategy/' + this._options.atCapacityStrategy))(this, this._options);
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
Whipper.prototype.invoke = function(method, args) {
  var worker = this._loadStrategy.selectWorker();
  if (!worker) {
    return this._atCapacityStategy.handle(method, args);
  }
  return worker.invoke(method, args);
};


module.exports = Whipper;
