
const _ = require('lodash');
const joi = require('joi');

function validateOptions(o, optionsSchema) {
  var optionsResult = joi.validate(o, optionsSchema);
  if (optionsResult.error) {
    throw optionsResult.error;
  }
  return o;
}

function normalizeOptions(o, optionsSchema, optionDefaults) {
  o = _.extend({}, optionDefaults, o);
  return validateOptions(o, optionsSchema);
}

module.exports = {
  validateOptions: validateOptions,
  normalizeOptions: normalizeOptions
};
