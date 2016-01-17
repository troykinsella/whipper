"use-strict";

require('es6-promise');
const EventEmitter = require('events').EventEmitter;
const util = require('util');
const whipperUtil = require('./util');
const joi = require('joi');
const WorkerPool = require('./worker-pool');
const WorkerHandle = require('./worker-handle');
const WorkerProxy = require('./worker-proxy');
const Call = require('./call');
const CallDispatcher = require('./call-dispatcher');

const AtCapacityError = require('./error/at-capacity-error');
const TimeoutError = require('./error/timeout-error');

/**
 * Whipper options
 */
const optionsSchema = joi.compile({


  /**
   *
   */
  loadStrategy: joi.alternatives()
    .try(joi.string().valid('basic'), joi.func())
    .default('basic'),

  /**
   *
   */
  atCapacityStrategy: joi.alternatives()
    .try(joi.string().valid('queue', 'drop'), joi.func())
    .default('queue'),

  /**
   *
   */
  logger: joi.func()
    .default(function() {})
});

/**
 *
 * @param options
 * @constructor
 */
function Whipper(options) {
  EventEmitter.call(this);
  this.setMaxListeners(0);

  options = whipperUtil.validateOptions(options, optionsSchema);
  this._options = options;

  this._workerPool = this._createWorkerPool();
  this._loadStrategy = this._createLoadStrategy();
  this._atCapacityStrategy = this._createAtCapacityStrategy();
  this._callDispatcher = this._createCallDispatcher();

}
util.inherits(Whipper, EventEmitter);

// Expose nested types
Whipper.Worker = WorkerHandle;
Whipper.AtCapacityError = AtCapacityError;
Whipper.TimeoutError = TimeoutError;

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
  return whipperUtil.createLoadStrategyForName(
    this._options.loadStrategy,
    this._workerPool,
    this,
    this._options);
};

/**
 *
 * @private
 */
Whipper.prototype._createAtCapacityStrategy = function() {
  return whipperUtil.createAtCapacityStrategyForName(
    this._options.atCapacityStrategy,
    this,
    this._loadStrategy,
    this._options);
};

/**
 *
 * @return {*}
 * @private
 */
Whipper.prototype._createCallDispatcher = function() {
  return new CallDispatcher(this._loadStrategy, this._atCapacityStrategy, this, this._options);
};

/**
 *
 */
Whipper.prototype.workerCount = function() {
  return this._workerPool.workerCount();
};

/**
 *
 * @return {Promise}
 */
Whipper.prototype.workerProxy = function() {
  return new Promise(function(resolve, reject) {
    this._loadStrategy.selectWorker().then(function(worker) {
      worker.discoverInterface().then(function(reply) {
        var proxy = new WorkerProxy(reply.iface, this.invoke.bind(this));
        resolve(proxy);
      }.bind(this)).catch(function(err) {
        reject(err);
      });
    }.bind(this)).catch(function(err) {
      reject(err);
    });
  }.bind(this));
};

/**
 *
 * @param method
 * @param args
 * @param callback
 */
Whipper.prototype.invoke = function(method, args) {
  var call = new Call(method, args);
  this._callDispatcher.dispatch(call);
  return call.promise;
};

/**
 *
 * @param force
 */
Whipper.prototype.shutdown = function(force) {
  return this._workerPool.shutdown(force);
};

/**
 *
 * @return {*|Object}
 */
Whipper.prototype.stats = function() {
  return this._workerPool.stats();
};

module.exports = Whipper;
