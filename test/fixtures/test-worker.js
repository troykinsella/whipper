module.exports = {
  hello: function(arg, callback) {
    callback(null, "received: " + arg);
  },
  returnError: function(callback) {
    callback(new Error("test"));
  },
  throwError: function() {
    throw new Error('I suck');
  },
  waitFor: function(ms, callback) {
    setTimeout(callback, ms);
  },
  throwErrorAfter: function(ms, callback) {
    setTimeout(function() {
      throw new Error('I suck');
    }, ms);
  }
};
