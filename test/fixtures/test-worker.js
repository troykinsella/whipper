"use-strict";

require('es6-promise');

// This is a safety measure to kill child processes when
// whipper functions for controlling termination are failing.
// This allows the overall test process to complete and report
// upon the error.
if (require.main.filename.indexOf('worker-wrapper.js') > -1) {
  setTimeout(function() {
    console.log("ERROR: Child process terminating itself: " + process.pid);
    process.exit();
  }, 30000);
}

module.exports = {
  returnResult: function(arg) {
    return arg;
  },
  returnTwoResults: function(arg1, arg2) {
    return [ arg1, arg2 ];
  },
  returnThreeResults: function(arg1, arg2, arg3) {
    return [ arg1, arg2, arg3 ];
  },
  callbackResultNow: function(arg, callback) {
    callback(null, arg);
  },
  callbackResultLater: function(arg, callback) {
    setTimeout(function() {
      callback(null, arg);
    }, 0);
  },
  promiseResultNow: function(arg) {
    return Promise.resolve(arg);
  },
  promiseResultLater: function(arg) {
    return new Promise(function(resolve) {
      setTimeout(function() {
        resolve(arg);
      }, 0);
    });
  },
  returnError: function() {
    return new Error('I suck');
  },
  throwError: function() {
    throw new Error('I suck');
  },
  callbackErrorNow: function(callback) {
    callback(new Error('I suck'));
  },
  callbackErrorLater: function(callback) {
    setTimeout(function() {
      callback(new Error('I suck'));
    }, 0);
  },
  promiseErrorNow: function() {
    return Promise.reject(new Error('I suck'));
  },
  promiseErrorLater: function() {
    return new Promise(function(resolve, reject) {
      setTimeout(function() {
        reject(new Error('I suck'));
      }, 0);
    });
  },
  waitFor: function(ms, callback) {
    setTimeout(callback, ms);
  },
  spin: function(callback) {
    var spin = function() {
      for (var i = 0; i < 1000000000; i++) {
        // Nothing
      }
      setTimeout(spin, 0);
    };
    callback();
    spin();
  },
  drop: function() {}
};
