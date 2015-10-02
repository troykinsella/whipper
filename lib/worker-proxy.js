"use-strict";

/**
 *
 * @param iface
 * @param invoke
 * @constructor
 */
function WorkerProxy(iface, invoke) {

  iface.forEach(function(method) {
    this[method] = function() {
      var args = Array.prototype.slice.apply(arguments);
      var userCallback;

      if (typeof args[args.length - 1] === 'function') {
        userCallback = args.pop();
      }

      var promise = invoke(method, args).then(function(reply) {
        if (userCallback) {
          userCallback(reply);
        }
        return reply; // Propagate the reply to the next then() call
      });

      if (!userCallback) {
        return promise;
      }
    };
  }.bind(this));

}

module.exports = WorkerProxy;
