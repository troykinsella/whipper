
const joi = require('joi');

const optionsSchema = joi.compile({

  /**
   * The minimum number of workers that will be maintained.
   */
  minWorkers: joi.number().integer().min(1),

  /**
   * The maximum number of workers that will be maintained.
   */
  maxWorkers: joi.number().integer().min(joi.ref('minWorkers')),

});

const optionDefaults = {
  minWorkers: 1,
  maxWorkers: require('os').cpus().length
};

function validateOptions(o) {
  var optionsResult = joi.validate(o, optionsSchema);
  if (optionsResult.error) {
    throw optionsResult.error;
  }
  return o;
}

function normalizeOptions(o) {
  o = _.extend({}, optionDefaults, o);
  return validateOptions(o);
}


/**
 *
 * @param pool
 * @param options
 * @constructor
 */
function BasicLoadStrategy(pool, options) {
  this._pool = pool;
  this._options = options;
};

/**
 *
 * @return {*|promise}
 */
BasicLoadStrategy.prototype.selectWorker = function() {

  var def = Q.defer();

  this._pool.ensureMinimumWorkers(this._options.minWorkers).then(function() {
    if (this._pool.availableWorkerCount() === 0) {
      if (this._pool.workerCount() >= this._options.maxWorkers) {
        def.resolve(null);
      } else {
        this._pool.addWorker().then(function(worker) {
          def.resolve(worker);
        }).fail(function(err) {
          def.reject(err);
        });
      }
    } else {
      var worker = this._pool.availableWorker();
      def.resolve(worker);
    }
  }.bind(this));

  return def.promise;
};

module.exports = BasicLoadStrategy;
