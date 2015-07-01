var util = require('util');

function InvocationTimeoutError(message) {
  Error.call(this);
  this.message = message;
}
InvocationTimeoutError.prototype.type = 'InvocationTimeoutError';
InvocationTimeoutError.prototype.constructor = InvocationTimeoutError;
util.inherits(InvocationTimeoutError, Error);

module.exports = InvocationTimeoutError;
