
var Q = require('q');
var workerModule;

/**
 *
 * @param m
 * @returns {Array}
 */
function extractInterface(m) {
  var iface = [];

  Object.keys(m).forEach(function(name) {
    if (typeof m[name] === 'function') {
      iface.push(name);
    }
  });

  return iface;
}

/**
 *
 */
var opHandlers = {

  /**
   *
   * @param payload
   * @param callback
   */
  init: function(def, payload) {
    workerModule = require(payload.moduleName);
    def.resolve({
      pid: process.pid
    });
  },

  /**
   *
   * @param payload
   * @param callback
   */
  iface: function(def) {
    def.resolve({
      iface: extractInterface(workerModule)
    })
  },

  /**
   *
   * @param payload
   * @param callback
   */
  ping: function(def) {
    def.resolve({
      pid: process.pid
    });
  },

  /**
   *
   * @param playload
   * @param callback
   */
  die: function(def) {
    process.exit(0);
    def.resolve();
  },

  /**
   *
   * @param payload
   * @param callback
   */
  invoke: function(def, payload) {
    var method = workerModule[payload.method];
    if (!method) {
      return def.reject(new Error('Worker method not found: ' + payload.method));
    }

    var args = payload.args;

    // Configure callback-style reply
    args.push(function(err, reply) {
      if (err) {
        def.reject(err);
      } else {
        def.resolve(reply);
      }
    });

    // Invoke the method
    var result = method.apply(null, args);

    // Configure promise-style reply
    if (result && result.then) {
      result.then(function(reply) {
        def.resolve(reply);
      }).fail(function(err) {
        def.reject(err);
      });
    }
  }

};

/**
 *
 * @param op
 * @param payload
 * @param callback
 */
function handleOp(op, payload) {
  var def = Q.defer();
  var handler = opHandlers[op];
  if (handler) {
    handler(def, payload);
  } else {
    def.reject(new Error('Invalid op: ' + op));
  }
  return def.promise;
}

/**
 *
 * @param id
 * @param message
 */
function sendReply(id, message) {
  process.send({
    id: id,
    message: message
  });
}

/**
 *
 * @param err
 * @return {{type: (*|string), message: *, stack: *}}
 */
function serializeError(err) {
  return {
    type: err.type || 'Error',
    message: err.message,
    stack: err.stack
  };
}

function sendError(id, err) {
  if (err instanceof Error) {
    err = serializeError(err);
  }
  process.send({
    id: id,
    error: err
  })
}

/**
 *
 */
process.on('message', function(data) {
  var msg = data.message;
  handleOp(msg.op, msg.payload)
    .then(function(reply) {
      sendReply(data.id, reply);
    })
    .fail(function(err) {
      sendError(data.id, err);
    });
});
