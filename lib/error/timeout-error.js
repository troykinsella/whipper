"use-strict";
const util = require('util');

function TimeoutError(message) {
  Error.call(this);
  this.message = message;
}
TimeoutError.prototype.type = 'TimeoutError';
TimeoutError.prototype.constructor = TimeoutError;
util.inherits(TimeoutError, Error);

module.exports = TimeoutError;
