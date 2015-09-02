var util = require('util');

function AtCapacityError(message) {
  Error.call(this);
  this.message = message;
}
AtCapacityError.prototype.type = 'AtCapacityError';
AtCapacityError.prototype.constructor = AtCapacityError;
util.inherits(AtCapacityError, Error);

module.exports = AtCapacityError;
