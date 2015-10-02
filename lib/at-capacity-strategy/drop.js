"use-strict";

/**
 *
 * @constructor
 */
function DropStrategy(emitter) {
  this._emitter = emitter;
}

/**
 *
 */
DropStrategy.prototype.handle = function(call) {
  this._emitter("at-capacity:dropped", {
    method: call.method,
    args: call.args
  });
  call.deferred.resolve(null);
  return true;
};

module.exports = DropStrategy;
