"use-strict";
const _ = require('lodash');

const TimeoutError = require('./error/timeout-error');

/**
 *
 * @param method
 * @param args
 * @param deferred
 * @constructor
 */
function Call(method, args) {

  // Normalize args
  args = args || [];
  if (!_.isArray(args)) {
    args = [ args ];
  }

  this.method = method;
  this.args = args;
  this.promise = new Promise(function(resolve, reject) {
    this.deferred = {
      resolve: resolve,
      reject: reject
    };
  }.bind(this));
}

/**
 *
 * @param worker
 */
Call.prototype.invoke = function(worker) {
  worker.invoke(this.method, this.args).then(function(reply) {
    this.deferred.resolve(reply);
  }.bind(this)).catch(function(err) {
    this.deferred.reject(err);
  }.bind(this));

  return this.promise;
};

/**
 *
 * @param msg
 */
Call.prototype.timeout = function(msg) {
  var err = new TimeoutError(msg);
  this.deferred.reject(err);
};

/**
 *
 * @return {string}
 */
Call.prototype.toString = function() {
  return "Call[method=" + this.method + ",args=" + JSON.stringify(this.args) + "]";
};

module.exports = Call;
