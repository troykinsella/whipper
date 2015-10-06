"use-strict";
const AtCapacityError = require('../error/at-capacity-error');

/**
 *
 * @constructor
 */
function ErrorStrategy(emitter) {
  this._emitter = emitter;
}

/**
 *
 */
ErrorStrategy.prototype.handle = function(call) {
  this._emitter("at-capacity:error", {
    method: call.method,
    args: call.args
  });
  call.deferred.reject(new AtCapacityError("At capacity"));
  return true;
};

module.exports = ErrorStrategy;
