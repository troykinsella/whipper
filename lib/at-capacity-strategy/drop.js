var Q = require('q');

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
DropStrategy.prototype.handle = function(method, args) {
  var def = Q.defer();
  this._emitter("at-capacity:dropped", {
    method: method,
    args: args
  });
  def.resolve(null);
  return def.promise;
};

module.exports = DropStrategy;
