
const _ = require('lodash');
const joi = require('joi');

function validateOptions(o, optionsSchema) {
  var optionsResult = joi.validate(o, optionsSchema, {
    allowUnknown: true
  });
  if (optionsResult.error) {
    throw optionsResult.error;
  }
  return optionsResult.value; // Validated/normalized options
}

/**
 *
 * @param nameOrFunction
 * @param emitter
 * @param loadStrategy
 * @param options
 * @return {*}
 */
function createAtCapacityStrategyForName(nameOrFunction, emitter, loadStrategy, options) {
  var result;
  switch (nameOrFunction) {
    case 'drop':
    case 'error':
    case 'queue':
      result = new (require('./at-capacity-strategy/' + nameOrFunction))(emitter, loadStrategy, options);
      break;
  }

  if (typeof nameOrFunction === 'function') {
    result = nameOrFunction(emitter, loadStrategy, options);
  }

  if (!result) {
    throw new Error("Invalid at-capacity strategy: " + nameOrFunction);
  }

  return result;
}

/**
 *
 * @param err
 */
function deserializeError(err) {
  if (err instanceof Error) {
    return err;
  }

  var Type;
  switch (err.type) {
    case 'TypeError': Type = TypeError; break;
    case 'RangeError': Type = RangeError; break;
    case 'EvalError': Type = EvalError; break;
    case 'ReferenceError': Type = ReferenceError; break;
    case 'SyntaxError': Type = SyntaxError; break;
    default: Type = Error; break;
  }

  var e = new Type(err.message);
  e.stack = err.stack;

  return e;
}


module.exports = {
  createAtCapacityStrategyForName: createAtCapacityStrategyForName,
  deserializeError: deserializeError,
  validateOptions: validateOptions
};
