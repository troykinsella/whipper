
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
  init: function(payload, callback) {
    workerModule = require(payload.moduleName);
    //console.log("Module: ", workerModule);
    callback({
      pid: process.pid
    });
  },

  /**
   *
   * @param payload
   * @param callback
   */
  iface: function(payload, callback) {
    callback({
      iface: extractInterface(workerModule)
    })
  },

  /**
   *
   * @param payload
   * @param callback
   */
  ping: function(payload, callback) {
    callback({
      pid: process.pid
    });
  },

  /**
   *
   * @param playload
   * @param callback
   */
  die: function(playload, callback) {
    callback();
    process.exit(0);
  },

  /**
   *
   * @param payload
   * @param callback
   */
  invoke: function(payload, callback) {
    var method = workerModule[payload.method];

    var args = payload.args;
    args.push(callback);

    //console.log("ARGS: ", args);

    var result = method.apply(null, args);
  }

};

/**
 *
 * @param op
 * @param payload
 * @param callback
 */
function handleOp(op, payload, callback) {
  var handler = opHandlers[op];
  handler(payload, callback);
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
 */
process.on('message', function(data) {
  var msg = data.message;
  handleOp(msg.op, msg.payload, function(reply) {
    sendReply(data.id, reply);
  });
});
