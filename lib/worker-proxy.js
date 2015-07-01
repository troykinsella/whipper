
const Q = require('q');

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
      var def;
      var userCallback;

      if (typeof args[args.length - 1] === 'function') {
        userCallback = args.pop();
      }

      if (!userCallback) {
        def = Q.defer();
      }

      invoke(method, args, function(reply) {
        if (userCallback) {
          userCallback(reply);
        } else {
          def.resolve(reply);
        }
      });

      if (def) {
        return def.promise;
      }
    }
  }.bind(this));

}

module.exports = WorkerProxy;
