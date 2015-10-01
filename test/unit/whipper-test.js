const Q = require('q');
const assert = require('assert');
const testUtil = require('../util');
const Whipper = require('../../lib/whipper');
const WorkerProxy = require('../../lib/worker-proxy');

const testWorkerPath = require.resolve('../fixtures/test-worker');

Q.longStackSupport = true;

var whipper;

function createWhipper(options) {
  options = options || {};
  options.workerModulePath = testWorkerPath;
  //options.logger = console.log;

  whipper = new Whipper(options);
}

describe('whipper', function() {

  afterEach(function(done) {
    whipper.shutdown().then(function() {
      done();
    }).fail(done);
  });

  /*it('should immediately initialize workers', function(done) {
    var expectedCount = 1;
    var count = 0;

    createWhipper({
      minWorkers: expectedCount,
      maxWorkers: expectedCount
    });

    whipper.on("worker:state:processing", function(worker) {
      console.log("PROCESSING");
      count++;
//      assert(isProcessRunning(worker.pid()));
    });

    whipper.on("worker:state:changed", function(worker) {
      console.log("STATE CHANGED: ", worker);
    });

    whipper.on("worker:pool:available", function() {
      console.log("AVAILABLE");
//      assert.equal(expectedCount, count);
      done();
    });
  });*/

  describe("#invoke", function() {

    it('should invoke a worker method', function(done) {
      createWhipper({
        maxWorkers: 1
      });

      whipper
        .invoke('returnResult', 'hi')
        .then(function(reply) {
          assert.equal('hi', reply);
          done();
        })
        .fail(done);
    });
  });

  describe('WorkerProxy', function() {

    it('should resolve a proxy instance', function(done) {
      createWhipper({
        maxWorkers: 1
      });

      whipper.workerProxy().then(function(proxy) {
        assert(proxy instanceof WorkerProxy);
        done();
      }).fail(done);
    });

    it('should reflect the worker interface', function(done) {
      createWhipper({
        maxWorkers: 1
      });

      whipper.workerProxy().then(function(proxy) {
        var iface = [];

        Object.keys(proxy).forEach(function(name) {
          var val = proxy[name];
          if (typeof val === 'function') {
            iface.push(name);
          }
        });

        assert.deepEqual(testUtil.getTestWorkerInterface(), iface);
        done();
      }).fail(done);
    });

    it('should proxy calls to a worker with callback', function() {
      createWhipper({
        maxWorkers: 1
      });

      whipper.workerProxy().then(function(worker) {
        worker.hello('hi', function(reply) {
          assert.equal('hi', reply);
          done();
        });
      });
    });

    it('should proxy calls to a worker with promise', function() {
      createWhipper({
        maxWorkers: 1
      });

      whipper.workerProxy().then(function(worker) {
        worker.hello('hi').then(function(reply) {
          assert.equal('hi', reply);
          done();
        });
      });
    });
  });

});
