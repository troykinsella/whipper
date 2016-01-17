/*jshint -W030 */
"use strict";

const EventEmitter = require('events').EventEmitter;
const BasicLoadStrategy = require('../../../lib/load-strategy/basic');

var testEmitter;

function createLoadStrategy(mockPool, options) {
  options = options || {};
  options.minWorkers = options.minWorkers || 1;
  options.maxWorkers = options.maxWorkers || 2;

  return new BasicLoadStrategy(mockPool, testEmitter, options);
}

function mockResolvedPromise(resolved, callCB) {
  return {
    then: function(cb) {
      if (callCB !== false) {
        cb(resolved);
      }
      return this;
    },
    catch: function() {
      return this;
    }
  };
}

describe('load-strategy', function() {

  describe('basic', function() {

    beforeEach(function() {
      testEmitter = new EventEmitter();
    });

    describe("#selectWorker", function() {

      it('should ensure minimum workers created', function(done) {
        var bls = createLoadStrategy({
          ensureMinimumWorkers: function(num) {
            num.should.equal(123);
            done();
            return mockResolvedPromise(undefined, false);
          }
        }, {
          minWorkers: 123,
          maxWorkers: 124
        });

        bls.selectWorker();
      });

      it('should return a worker if available', function(done) {
        var bls = createLoadStrategy({
          ensureMinimumWorkers: function() {
            return mockResolvedPromise(undefined, true);
          },
          availableWorkerCount: function() {
            return 1;
          },
          idleWorker: function() {
            return "worker";
          }
        });

        bls.selectWorker().then(function(worker) {
          worker.should.equal("worker");
          done();
        }).catch(done);
      });

      it('should create a worker when unavailable and below max', function(done) {
        var bls = createLoadStrategy({
          ensureMinimumWorkers: function() {
            return mockResolvedPromise(undefined, true);
          },
          availableWorkerCount: function() {
            return 0;
          },
          workerCount: function() {
            return 1; // less than max of 2 (default)
          },
          addWorker: function() {
            return mockResolvedPromise("worker");
          }
        });

        bls.selectWorker().then(function(worker) {
          worker.should.equal("worker");
          done();
        }).catch(done);
      });

      it('should await available worker when at capacity', function(done) {
        var bls = createLoadStrategy({
          ensureMinimumWorkers: function() {
            return mockResolvedPromise(undefined, true);
          },
          availableWorkerCount: function() {
            return 0;
          },
          workerCount: function() {
            return 2; // equal max of 2 (default)
          }
        });

        bls.selectWorker().then(function(worker) {
          worker.should.equal("worker");
          done();
        }).catch(done);

        setTimeout(function() {
          testEmitter.emit("worker:pool:available", "worker");
        }, 500);
      });

    });
  });
});
