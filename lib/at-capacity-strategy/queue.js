"use-strict";

/**
 * Queue strategy options
 */
/*const optionsSchema = joi.compile({

  maxQueueSize: joi.number()
    .integer()
    .min(0)
    .allow(Infinity)
    .default(Infinity),

  queueFullStrategy: joi.alternatives()
    .try(joi.string().valid('queue', 'drop'), joi.func())
    .default("drop")

});*/

/**
 *
 * @constructor
 */
function QueueStrategy() {
}

/**
 *
 * @param invocation
 */
QueueStrategy.prototype.handle = function(call) {
  return false;
};

module.exports = QueueStrategy;
