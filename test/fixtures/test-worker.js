module.exports = {
  hello: function(arg, callback) {
    callback("received: " + arg);
  },
  returnError: function(callback) {
    callback(new Error("test"));
  },
  throwError: function(callback) {
    throw new Error();
  },
  waitFor: function(ms, callback) {
    setTimeout(callback, ms);
  }
};
