var Q = require('q');

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
ErrorStrategy.prototype.handle = function(method, args) {
  var def = Q.defer();
  this._emitter("at-capacity:error", {
    method: method,
    args: args
  });
  def.reject(new Error("At capacity"));
  return def.promise;
};

module.exports = ErrorStrategy;
