var assert = require('assert');
var testUtil = require('../util');
var Whipper = require('../../lib/whipper');

var testWorkerPath = require.resolve('../fixtures/test-worker');
var testWorkerInterface = testUtil.getTestWorkerInterface();

var testEmitter;

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

function createWhipper(options) {
  options = options || {};
  options.workerModulePath = testWorkerPath;
  options.logger = console.log;

  var whipper = new Whipper(options);
  return whipper;
}

describe('whipper', function() {

  it('should immediately initialize workers', function(done) {
    var expectedCount = 1;
    var count = 0;

    var whipper = createWhipper({
      minWorkers: expectedCount,
      maxWorkers: expectedCount
    });

    whipper.on("worker:state:processing", function(worker) {
      count++;
      assert(isProcessRunning(worker.pid()));
    });

    whipper.on("workers:ready", function() {
      assert.equal(expectedCount, count);
      done();
    });
  });

  describe("#invoke", function() {

    it('should invoke a worker method', function(done) {
      var whipper = createWhipper({
        maxWorkers: 1
      });

      whipper.invoke('hello', 'hi', function(reply) {
        assert.equal("received: hi", reply);
        done();
      });
    });

    /*it('should handle a returned error', function(done) {
      var whipper = createWhipper({
        maxWorkers: 1
      });

      whipper.invoke('returnError', [], function(err) {
        assert(err instanceof Error);
        done();
      });
    });*/

    /*it('should handle a thrown error', function(done) {
      var whipper = createWhipper({
        maxWorkers: 1
      });

      whipper.invoke('throwError', [], function(err) {
        // TODO: don't expect a response
      });
    });*/
  });

  describe("#getWorkerInterface", function() {

    it('should discover the worker interface', function(done) {

      wm = createWM();
      wm.getWorkerInterface().then(function(iface) {
        iface.should.deep.equal(testWorkerInterface);
      });
    });

  });

  describe('WorkerProxy', function() {

    it('should reflect the worker interface', function(done) {
      var whipper = createWhipper({
        maxWorkers: 1
      });

      whipper.workerProxy().then(function(worker) {
        var iface = [];

        Object.keys(worker).forEach(function(name) {
          var val = worker[name];
          if (typeof val === 'function') {
            iface.push(name);
          }
        });

        assert.deepEqual([ 'hello', 'returnError', 'throwError', 'waitFor' ], iface);
        done();
      });
    });

    it('should proxy calls to a worker with callback', function() {
      var whipper = createWhipper({
        maxWorkers: 1
      });

      whipper.workerProxy().then(function(worker) {
        worker.hello('hi', function(reply) {
          assert.equal("received: hi", reply);
          done();
        });
      });
    });

    it('should proxy calls to a worker with promise', function() {
      var whipper = createWhipper({
        maxWorkers: 1
      });

      whipper.workerProxy().then(function(worker) {
        worker.hello('hi').then(function(reply) {
          assert.equal("received: hi", reply);
          done();
        });
      });
    });
  });

});
