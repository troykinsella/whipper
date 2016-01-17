/*jshint -W030 */
"use strict";

var EventEmitter = require('events').EventEmitter;
var assert = require('assert');

var chai = require('chai');
var expect = chai.expect;

var WorkerHandle = require('../../lib/worker-handle');
var WorkerPool = require('../../lib/worker-pool');

var testWorkerPath = require.resolve('../fixtures/test-worker');

chai.should();

var pool;
var testEmitter;

function createPool(options) {
  options = options || {};
  options.workerModulePath = testWorkerPath;
  //options.logger = console.log;

  pool = new WorkerPool(testEmitter, options);
}

describe('worker-pool', function() {

  beforeEach(function() {
    testEmitter = new EventEmitter();
  });

  afterEach(function(done) {
    pool.shutdown().then(function() {
      done();
    }).catch(done);
  });

  it('should have a predictable initial state', function() {
    createPool();
    pool.workerCount().should.equal(0);
    pool.allWorkers().values().should.deep.equal([]);
    pool.idleWorkers().values().should.deep.equal([]);
    expect(pool.idleWorker()).to.equal(null);
    pool.busyWorkers().values().should.deep.equal([]);
    expect(pool.busyWorker()).to.equal(null);
    pool.atCapacityWorkers().values().should.deep.equal([]);
    pool.availableWorkerCount().should.equal(0);
  });

  describe('#addWorker', function() {

    it('should add a worker when empty', function(done) {
      createPool();
      pool.addWorker().then(function(worker) {
        (worker instanceof WorkerHandle).should.be.true;
        pool.workerCount().should.equal(1);
        done();
      }).catch(done);

      pool.workerCount().should.equal(1);
    });

    it('should add a worker when not empty', function(done) {
      createPool();
      pool.addWorker().then(function() {
        pool.addWorker().then(function(worker) {
          (worker instanceof WorkerHandle).should.be.true;
          pool.workerCount().should.equal(2);
          done();
        }).catch(done);

        pool.workerCount().should.equal(2);
      }).catch(done);
    });

  });

  describe('#allWorkers', function() {

    it('should return all workers', function(done) {
      createPool();
      pool.addWorker().then(function(worker1) {
        pool.allWorkers().values().should.deep.equal([ worker1 ]);
        pool.addWorker().then(function(worker2) {
          pool.allWorkers().values().should.deep.equal([worker1, worker2]);
          pool.addWorker().then(function (worker3) {
            pool.allWorkers().values().should.deep.equal([worker1, worker2, worker3]);
            done();
          }).catch(done);
        }).catch(done);
      }).catch(done);
    });

  });

  describe('#aWorker', function() {

    it('should return a worker', function(done) {
      createPool();
      pool.addWorker().then(function(worker1) {
        pool.aWorker().should.equal(worker1);
        done();
      }).catch(done);
    });

  });

  describe('#idleWorkers', function() {

    it('should return idle workers', function(done) {
      createPool();
      pool.addWorker().then(function(worker1) {
        pool.idleWorkers().values().should.deep.equal([ worker1 ]);
        pool.addWorker().then(function(worker2) {
          pool.idleWorkers().values().should.deep.equal([ worker1, worker2 ]);
          done();
        }).catch(done);
      }).catch(done);
    });

    it('should not return non-idle workers', function(done) {
      createPool({
        maxConcurrentCalls: 1
      });
      pool.addWorker().then(function(worker1) {
        pool.addWorker().then(function(worker2) {
          worker1.invoke('returnResult');
          pool.idleWorkers().values().should.deep.equal([ worker2 ]);
          done();
        }).catch(done);
      }).catch(done);
    });

  });

  describe('#idleWorker', function() {

    it('should return idle worker', function(done) {
      createPool();
      pool.addWorker().then(function(worker1) {
        pool.idleWorker().should.equal(worker1);
        pool.addWorker().then(function(worker2) {
          pool.idleWorker().should.equal(worker1);
          done();
        }).catch(done);
      }).catch(done);
    });

    it('should not return non-idle worker', function(done) {
      createPool({
        maxConcurrentCalls: 1
      });
      pool.addWorker().then(function(worker1) {
        pool.addWorker().then(function(worker2) {
          worker1.invoke('returnResult');
          pool.idleWorker().should.equal(worker2);
          done();
        }).catch(done);
      }).catch(done);
    });

  });

  describe('#busyWorkers', function() {

    it('should return busy workers', function(done) {
      createPool({
        maxConcurrentCalls: 2
      });
      pool.addWorker().then(function(worker1) {
        pool.addWorker().then(function(worker2) {
          worker1.invoke('returnResult');
          pool.busyWorkers().values().should.deep.equal([ worker1 ]);
          done();
        }).catch(done);
      }).catch(done);
    });

  });

  describe('#busyWorker', function() {

    it('should return busy worker', function(done) {
      createPool({
        maxConcurrentCalls: 2
      });
      pool.addWorker().then(function(worker1) {
        pool.addWorker().then(function(worker2) {
          worker1.invoke('returnResult');
          pool.busyWorker().should.equal(worker1);
          done();
        }).catch(done);
      }).catch(done);
    });

  });

  describe('#busyWorkerCount', function() {

    it('should return busy worker count', function(done) {
      createPool({
        maxConcurrentCalls: 2
      });
      pool.addWorker().then(function(worker1) {
        pool.addWorker().then(function(worker2) {
          worker1.invoke('returnResult');
          pool.busyWorkerCount().should.equal(1);
          done();
        }).catch(done);
      }).catch(done);
    });

  });

  describe('#atCapacityWorkers', function() {

    it('should return at-capacity workers', function(done) {
      createPool({
        maxConcurrentCalls: 1
      });
      pool.addWorker().then(function(worker1) {
        pool.addWorker().then(function(worker2) {
          worker1.invoke('returnResult');
          pool.atCapacityWorkers().values().should.deep.equal([ worker1 ]);
          done();
        }).catch(done);
      }).catch(done);
    });

  });

  describe('#atCapacityWorkerCount', function() {

    it('should return at-capacity worker count', function(done) {
      createPool({
        maxConcurrentCalls: 1
      });
      pool.addWorker().then(function(worker1) {
        pool.addWorker().then(function(worker2) {
          worker1.invoke('returnResult');
          pool.atCapacityWorkerCount().should.equal(1);
          done();
        }).catch(done);
      }).catch(done);
    });

  });

  describe('#ensureMinimumWorkers', function() {

    function assertNothingHappens(pool, arg, done) {
      var count = pool.workerCount();
      pool.ensureMinimumWorkers(arg).then(function() {
        pool.workerCount().should.equal(count);
        done();
      }).catch(done);
      pool.workerCount().should.equal(count);
    }

    it('should do nothing when no parameters passed and empty', function(done) {
      createPool();
      assertNothingHappens(pool, undefined, done);
    });

    it('should do nothing when zero passed and empty', function(done) {
      createPool();
      assertNothingHappens(pool, 0, done);
    });

    it('should do nothing when no parameters passed and not empty', function(done) {
      createPool();
      pool.addWorker().then(function() {
        assertNothingHappens(pool, undefined, done);
      }).catch(done);
    });

    it('should do nothing when zero passed and not empty', function(done) {
      createPool();
      pool.addWorker().then(function() {
        assertNothingHappens(pool, 0, done);
      }).catch(done);
    });

    it('should do nothing when worker count equals requested minimum', function(done) {
      createPool();
      pool.addWorker().then(function() {
        assertNothingHappens(pool, 1, done);
      }).catch(done);
    });

    it('should do nothing when worker count greater than requested minimum', function(done) {
      createPool();
      pool.addWorker().then(function() {
        return pool.addWorker();
      }).then(function() {
        assertNothingHappens(pool, 1, done);
      }).catch(done);
    });

    it('should create one worker when empty', function(done) {
      createPool();
      pool.ensureMinimumWorkers(1).then(function() {
        pool.workerCount().should.equal(1);
        done();
      }).catch(done);
    });

    it('should create one worker when not empty', function(done) {
      createPool();
      pool.addWorker().then(function() {
        return pool.ensureMinimumWorkers(2);
      }).then(function() {
        pool.workerCount().should.equal(2);
        done();
      }).catch(done);
    });

    it('should create two workers when empty', function(done) {
      createPool();
      pool.ensureMinimumWorkers(2).then(function() {
        pool.workerCount().should.equal(2);
        done();
      }).catch(done);
    });

    it('should create two workers when not empty', function(done) {
      createPool();
      pool.addWorker().then(function() {
        return pool.ensureMinimumWorkers(3);
      }).then(function() {
        pool.workerCount().should.equal(3);
        done();
      }).catch(done);
    });

    it('should create three workers when empty', function(done) {
      createPool();
      pool.ensureMinimumWorkers(3).then(function() {
        pool.workerCount().should.equal(3);
        done();
      }).catch(done);
    });

    it('should create three workers when not empty', function(done) {
      createPool();
      pool.addWorker().then(function() {
        return pool.ensureMinimumWorkers(4);
      }).then(function() {
        pool.workerCount().should.equal(4);
        done();
      }).catch(done);
    });
  });

  describe('#removeWorker', function() {

    it('should reject when empty', function(done) {
      createPool();
      pool.removeWorker().then(function() {
        assert.fail("Removal succeeded");
      }).catch(function(result) {
        result.should.be.false;
        done();
      }).catch(done);
    });

    it('should remove a worker when one exists', function(done) {
      createPool();
      pool.addWorker().then(function(workerAdded) {
        pool.removeWorker().then(function(workerRemoved) {
          workerRemoved.should.equal(workerAdded);
          done();
        }).catch(done);

        pool.workerCount().should.equal(0);
      }).catch(done);
    });

    it('should remove a worker when two exist', function(done) {
      createPool();
      pool.addWorker().then(function() {
        return pool.addWorker();
      }).then(function() {
        pool.removeWorker().then(function() {
          done();
        }).catch(done);

        pool.workerCount().should.equal(1);
      }).catch(done);
    });

    it('should remove a worker when three exist', function(done) {
      createPool();
      pool.addWorker().then(function() {
        return pool.addWorker();
      }).then(function() {
        return pool.addWorker();
      }).then(function() {
        pool.removeWorker().then(function() {
          done();
        }).catch(done);

        pool.workerCount().should.equal(2);
      }).catch(done);
    });

    it('should remove a specific worker', function(done) {
      createPool();
      pool.ensureMinimumWorkers(3).then(function() {
        var aWorker = pool.allWorkers().values()[1];
        pool.removeWorker(aWorker).then(function(workerRemoved) {
          workerRemoved.should.equal(aWorker);
          done();
        }).catch(done);

        pool.workerCount().should.equal(2);
      }).catch(done);
    });

    // TODO: test force kill

  });

  describe('#ensureMaximumWorkers', function() {

    function assertNothingHappens(pool, arg, done) {
      var count = pool.workerCount();
      pool.ensureMaximumWorkers(arg).then(function() {
        pool.workerCount().should.equal(count);
        done();
      }).catch(done);
      pool.workerCount().should.equal(count);
    }

    it('should do nothing when no parameters passed and empty', function(done) {
      createPool();
      assertNothingHappens(pool, undefined, done);
    });

    it('should do nothing when zero passed and empty', function(done) {
      createPool();
      assertNothingHappens(pool, 0, done);
    });

    it('should do nothing when no parameters passed and not empty', function(done) {
      createPool();
      pool.addWorker().then(function() {
        assertNothingHappens(pool, undefined, done);
      }).catch(done);
    });

    it('should do nothing when worker count equals requested maximum', function(done) {
      createPool();
      pool.addWorker().then(function() {
        assertNothingHappens(pool, 1, done);
      }).catch(done);
    });

    it('should do nothing when worker count less than requested maximum', function(done) {
      createPool();
      pool.addWorker().then(function() {
        return pool.addWorker();
      }).then(function() {
        assertNothingHappens(pool, 3, done);
      }).catch(done);
    });

    it('should remove one worker when one exists', function(done) {
      createPool();
      pool.ensureMinimumWorkers(1).then(function() {
        return pool.ensureMaximumWorkers(0);
      }).then(function() {
        pool.workerCount().should.equal(0);
        done();
      }).catch(done);
    });

    it('should remove one worker when two exists', function(done) {
      createPool();
      pool.ensureMinimumWorkers(2).then(function() {
        return pool.ensureMaximumWorkers(1);
      }).then(function() {
        pool.workerCount().should.equal(1);
        done();
      }).catch(done);
    });

    it('should remove two workers when two exist', function(done) {
      createPool();
      pool.ensureMinimumWorkers(2).then(function() {
        return pool.ensureMaximumWorkers(0);
      }).then(function() {
        pool.workerCount().should.equal(0);
        done();
      }).catch(done);
    });

    it('should remove two workers when three exist', function(done) {
      createPool();
      pool.ensureMinimumWorkers(3).then(function() {
        return pool.ensureMaximumWorkers(1);
      }).then(function() {
        pool.workerCount().should.equal(1);
        done();
      }).catch(done);
    });

    it('should remove three workers when three exist', function(done) {
      createPool();
      pool.ensureMinimumWorkers(3).then(function() {
        return pool.ensureMaximumWorkers(0);
      }).then(function() {
        pool.workerCount().should.equal(0);
        done();
      }).catch(done);
    });

    it('should remove three workers when four exist', function(done) {
      createPool();
      pool.ensureMinimumWorkers(4).then(function() {
        return pool.ensureMaximumWorkers(1);
      }).then(function() {
        pool.workerCount().should.equal(1);
        done();
      }).catch(done);
    });

  });

  describe('#shutdown', function() {

    it('should do nothing when empty', function(done) {
      createPool();
      pool.shutdown().then(function() {
        done();
      }).catch(done);
    });

    it('should destroy all workers', function(done) {
      createPool();
      pool.ensureMinimumWorkers(3).then(function() {
        return pool.shutdown();
      }).then(function() {
        pool.workerCount().should.equal(0);
        done();
      }).catch(done);
    });
  });

  describe('event', function() {

    describe('worker:pool:available', function() {

      it('should emit when pool first available', function(done) {
        createPool();
        testEmitter.on("worker:pool:available", function() {
          done();
        });
        pool.addWorker().catch(done);
      });

      it('should emit when pool returns to available', function(done) {
        createPool({
          maxConcurrentCalls: 1
        });

        var calls = 0;
        testEmitter.on("worker:pool:available", function() {
          if (++calls == 2) {
            done();
          }
        });

        pool.addWorker().then(function(worker) {
          worker.invoke('returnResult');
        }).catch(done);
      });

    });

    describe('worker:pool:unavailable', function() {

      it('should emit when pool first unavailable', function(done) {
        createPool({
          maxConcurrentCalls: 1
        });
        var availableCalled = false;
        testEmitter.once("worker:pool:available", function() {
          availableCalled = true;
        });
        testEmitter.once("worker:pool:unavailable", function() {
          availableCalled.should.be.true;
          done();
        });

        pool.addWorker().then(function(worker) {
          worker.invoke('returnResult').catch(done);
        }).catch(done);
      });

      it('should emit when pool returns to unavailable', function(done) {
        createPool({
          maxConcurrentCalls: 1
        });

        var calls = 0;
        testEmitter.on("worker:pool:unavailable", function() {
          if (++calls == 2) {
            done();
          }
        });

        pool.addWorker().then(function(worker) {
          worker.invoke('returnResult').then(function() {
            worker.invoke('returnResult').catch(done);
          }).catch(done);
        }).catch(done);
      });

    });

  });

  describe("#stats", function() {

    it('should reflect initial state', function() {
      createPool();

      pool.stats().should.deep.equal({
        atCapacityWorkerCount: 0,
        busyWorkerCount: 0,
        idleWorkerCount: 0,
        maxSeenWorkerCount: 0,
        workerCount: 0,
        workers: {
          callsHandled: 0,
          errorCount: 0,
          forkCount: 0,
          maxSeenConcurrentCalls: 0,
          resetCount: 0
        }
      });
    });

    it('should reflect state of several workers', function(done) {
      createPool({
        maxConcurrentCalls: 2
      });
      pool.addWorker().then(function(worker1) {
        pool.addWorker().then(function(worker2) {
          worker1.invoke('returnResult').catch(done);

          pool.stats().should.deep.equal({
            atCapacityWorkerCount: 0,
            busyWorkerCount: 1,
            idleWorkerCount: 1,
            maxSeenWorkerCount: 2,
            workerCount: 2,
            workers: {
              callsHandled: 1,
              errorCount: 0,
              forkCount: 2,
              maxSeenConcurrentCalls: 1,
              resetCount: 0
            }
          });

          done();
        }).catch(done);
      }).catch(done);
    });

  });

});
