var Q = require('q');
var EventEmitter = require('events').EventEmitter;
var assert = require('assert');

var chai = require('chai');
var expect = chai.expect;
var should = chai.should();

var WorkerHandle = require('../../lib/worker-handle');
var WorkerPool = require('../../lib/worker-pool');

var testWorkerPath = require.resolve('../fixtures/test-worker');

Q.longStackSupport = true;

var pool;
var testEmitter;

function createPool(options) {
  options = options || {};
  options.workerModulePath = testWorkerPath;
  //options.logger = console.log;

  return new WorkerPool(testEmitter, options);
}

describe('worker-pool', function() {

  beforeEach(function() {
    testEmitter = new EventEmitter();
  });

  it('should have a predictable initial state', function() {
    pool = createPool();
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
      pool = createPool();
      pool.addWorker().then(function(worker) {
        (worker instanceof WorkerHandle).should.be.true;
        pool.workerCount().should.equal(1);
        done();
      }).fail(done);

      pool.workerCount().should.equal(1);
    });

    it('should add a worker when not empty', function(done) {
      pool = createPool();
      pool.addWorker().then(function() {
        pool.addWorker().then(function(worker) {
          (worker instanceof WorkerHandle).should.be.true;
          pool.workerCount().should.equal(2);
          done();
        });

        pool.workerCount().should.equal(2);
      }).fail(done);
    });

  });

  describe('#allWorkers', function() {

    it('should return all workers', function(done) {
      pool = createPool();
      pool.addWorker().then(function(worker1) {
        pool.allWorkers().values().should.deep.equal([ worker1 ]);
        pool.addWorker().then(function(worker2) {
          pool.allWorkers().values().should.deep.equal([worker1, worker2]);
          pool.addWorker().then(function (worker3) {
            pool.allWorkers().values().should.deep.equal([worker1, worker2, worker3]);
            done();
          }).fail(done);
        }).fail(done);
      }).fail(done);
    });

  });

  describe('#idleWorkers', function() {

    it('should return idle workers', function(done) {
      pool = createPool();
      pool.addWorker().then(function(worker1) {
        pool.idleWorkers().values().should.deep.equal([ worker1 ]);
        pool.addWorker().then(function(worker2) {
          pool.idleWorkers().values().should.deep.equal([ worker1, worker2 ]);
          done();
        });
      });
    });

    it('should not return non-idle workers', function(done) {
      pool = createPool({
        maxConcurrentCallsPerWorker: 1
      });
      pool.addWorker().then(function(worker1) {
        pool.addWorker().then(function(worker2) {
          worker1.invoke('returnResult');
          pool.idleWorkers().values().should.deep.equal([ worker2 ]);
          done();
        });
      });
    });

  });

  describe('#idleWorker', function() {

    it('should return idle worker', function(done) {
      pool = createPool();
      pool.addWorker().then(function(worker1) {
        pool.idleWorker().should.equal(worker1);
        pool.addWorker().then(function(worker2) {
          pool.idleWorker().should.equal(worker1);
          done();
        });
      });
    });

    it('should not return non-idle worker', function(done) {
      pool = createPool({
        maxConcurrentCallsPerWorker: 1
      });
      pool.addWorker().then(function(worker1) {
        pool.addWorker().then(function(worker2) {
          worker1.invoke('returnResult');
          pool.idleWorker().should.equal(worker2);
          done();
        });
      });
    });

  });

  describe('#busyWorkers', function() {

    it('should return busy workers', function(done) {
      pool = createPool({
        maxConcurrentCallsPerWorker: 2
      });
      pool.addWorker().then(function(worker1) {
        pool.addWorker().then(function(worker2) {
          worker1.invoke('returnResult');
          pool.busyWorkers().values().should.deep.equal([ worker1 ]);
          done();
        });
      });
    });

  });

  describe('#busyWorker', function() {

    it('should return busy worker', function(done) {
      pool = createPool({
        maxConcurrentCallsPerWorker: 2
      });
      pool.addWorker().then(function(worker1) {
        pool.addWorker().then(function(worker2) {
          worker1.invoke('returnResult');
          pool.busyWorker().should.equal(worker1);
          done();
        });
      });
    });

  });

  describe('#atCapacityWorkers', function() {

    it('should return at-capacity worker', function(done) {
      pool = createPool({
        maxConcurrentCallsPerWorker: 1
      });
      pool.addWorker().then(function(worker1) {
        pool.addWorker().then(function(worker2) {
          worker1.invoke('returnResult');
          pool.atCapacityWorkers().values().should.deep.equal([ worker1 ]);
          done();
        });
      });
    });

  });

  describe('#ensureMinimumWorkers', function() {

    function assertNothingHappens(pool, arg, done) {
      var count = pool.workerCount();
      pool.ensureMinimumWorkers(arg).then(function() {
        pool.workerCount().should.equal(count);
        done();
      }).fail(done);
      pool.workerCount().should.equal(count);
    }

    it('should do nothing when no parameters passed and empty', function(done) {
      pool = createPool();
      assertNothingHappens(pool, undefined, done);
    });

    it('should do nothing when zero passed and empty', function(done) {
      pool = createPool();
      assertNothingHappens(pool, 0, done);
    });

    it('should do nothing when no parameters passed and not empty', function(done) {
      pool = createPool();
      pool.addWorker().then(function() {
        assertNothingHappens(pool, undefined, done);
      }).fail(done);
    });

    it('should do nothing when zero passed and not empty', function(done) {
      pool = createPool();
      pool.addWorker().then(function() {
        assertNothingHappens(pool, 0, done);
      }).fail(done);
    });

    it('should do nothing when worker count equals requested minimum', function(done) {
      pool = createPool();
      pool.addWorker().then(function() {
        assertNothingHappens(pool, 1, done);
      }).fail(done);
    });

    it('should do nothing when worker count greater than requested minimum', function(done) {
      pool = createPool();
      pool.addWorker().then(function() {
        return pool.addWorker();
      }).then(function() {
        assertNothingHappens(pool, 1, done);
      }).fail(done);
    });

    it('should create one worker when empty', function(done) {
      pool = createPool();
      pool.ensureMinimumWorkers(1).then(function() {
        pool.workerCount().should.equal(1);
        done();
      }).fail(done);
    });

    it('should create one worker when not empty', function(done) {
      pool = createPool();
      pool.addWorker().then(function() {
        return pool.ensureMinimumWorkers(2);
      }).then(function() {
        pool.workerCount().should.equal(2);
        done();
      }).fail(done);
    });

    it('should create two workers when empty', function(done) {
      pool = createPool();
      pool.ensureMinimumWorkers(2).then(function() {
        pool.workerCount().should.equal(2);
        done();
      }).fail(done);
    });

    it('should create two workers when not empty', function(done) {
      pool = createPool();
      pool.addWorker().then(function() {
        return pool.ensureMinimumWorkers(3);
      }).then(function() {
        pool.workerCount().should.equal(3);
        done();
      }).fail(done);
    });

    it('should create three workers when empty', function(done) {
      pool = createPool();
      pool.ensureMinimumWorkers(3).then(function() {
        pool.workerCount().should.equal(3);
        done();
      }).fail(done);
    });

    it('should create three workers when not empty', function(done) {
      pool = createPool();
      pool.addWorker().then(function() {
        return pool.ensureMinimumWorkers(4);
      }).then(function() {
        pool.workerCount().should.equal(4);
        done();
      }).fail(done);
    });
  });

  describe('#removeWorker', function() {

    it('should reject when empty', function(done) {
      pool = createPool();
      pool.removeWorker().then(function() {
        assert.fail("Removal succeeded");
      }).fail(function(result) {
        result.should.be.false;
        done();
      }).fail(done);
    });

    it('should remove a worker when one exists', function(done) {
      pool = createPool();
      pool.addWorker().then(function(workerAdded) {
        pool.removeWorker().then(function(workerRemoved) {
          workerRemoved.should.equal(workerAdded);
          done();
        }).fail(done);

        pool.workerCount().should.equal(0);
      }).fail(done);
    });

    it('should remove a worker when two exist', function(done) {
      pool = createPool();
      pool.addWorker().then(function() {
        return pool.addWorker();
      }).then(function() {
        pool.removeWorker().then(function() {
          done();
        }).fail(done);

        pool.workerCount().should.equal(1);
      }).fail(done);
    });

    it('should remove a worker when three exist', function(done) {
      pool = createPool();
      pool.addWorker().then(function() {
        return pool.addWorker();
      }).then(function() {
        return pool.addWorker();
      }).then(function() {
        pool.removeWorker().then(function() {
          done();
        }).fail(done);

        pool.workerCount().should.equal(2);
      }).fail(done);
    });

    it('should remove a specific worker', function(done) {
      pool = createPool();
      pool.ensureMinimumWorkers(3).then(function() {
        var aWorker = pool.allWorkers().values()[1];
        pool.removeWorker(aWorker).then(function(workerRemoved) {
          workerRemoved.should.equal(aWorker);
          done();
        }).fail(done);

        pool.workerCount().should.equal(2);
      }).fail(done);
    });

    // TODO: test force kill

  });

  describe('#ensureMaximumWorkers', function() {

    function assertNothingHappens(pool, arg, done) {
      var count = pool.workerCount();
      pool.ensureMaximumWorkers(arg).then(function() {
        pool.workerCount().should.equal(count);
        done();
      }).fail(done);
      pool.workerCount().should.equal(count);
    }

    it('should do nothing when no parameters passed and empty', function(done) {
      pool = createPool();
      assertNothingHappens(pool, undefined, done);
    });

    it('should do nothing when zero passed and empty', function(done) {
      pool = createPool();
      assertNothingHappens(pool, 0, done);
    });

    it('should do nothing when no parameters passed and not empty', function(done) {
      pool = createPool();
      pool.addWorker().then(function() {
        assertNothingHappens(pool, undefined, done);
      }).fail(done);
    });

    it('should do nothing when worker count equals requested maximum', function(done) {
      pool = createPool();
      pool.addWorker().then(function() {
        assertNothingHappens(pool, 1, done);
      }).fail(done);
    });

    it('should do nothing when worker count less than requested maximum', function(done) {
      pool = createPool();
      pool.addWorker().then(function() {
        return pool.addWorker();
      }).then(function() {
        assertNothingHappens(pool, 3, done);
      }).fail(done);
    });

    it('should remove one worker when one exists', function(done) {
      pool = createPool();
      pool.ensureMinimumWorkers(1).then(function() {
        return pool.ensureMaximumWorkers(0);
      }).then(function() {
        pool.workerCount().should.equal(0);
        done();
      }).fail(done);
    });

    it('should remove one worker when two exists', function(done) {
      pool = createPool();
      pool.ensureMinimumWorkers(2).then(function() {
        return pool.ensureMaximumWorkers(1);
      }).then(function() {
        pool.workerCount().should.equal(1);
        done();
      }).fail(done);
    });

    it('should remove two workers when two exist', function(done) {
      pool = createPool();
      pool.ensureMinimumWorkers(2).then(function() {
        return pool.ensureMaximumWorkers(0);
      }).then(function() {
        pool.workerCount().should.equal(0);
        done();
      }).fail(done);
    });

    it('should remove two workers when three exist', function(done) {
      pool = createPool();
      pool.ensureMinimumWorkers(3).then(function() {
        return pool.ensureMaximumWorkers(1);
      }).then(function() {
        pool.workerCount().should.equal(1);
        done();
      }).fail(done);
    });

    it('should remove three workers when three exist', function(done) {
      pool = createPool();
      pool.ensureMinimumWorkers(3).then(function() {
        return pool.ensureMaximumWorkers(0);
      }).then(function() {
        pool.workerCount().should.equal(0);
        done();
      }).fail(done);
    });

    it('should remove three workers when four exist', function(done) {
      pool = createPool();
      pool.ensureMinimumWorkers(4).then(function() {
        return pool.ensureMaximumWorkers(1);
      }).then(function() {
        pool.workerCount().should.equal(1);
        done();
      }).fail(done);
    });

  });

  describe('#shutdown', function() {

    it('should do nothing when empty', function(done) {
      pool = createPool();
      pool.shutdown().then(function() {
        done();
      }).fail(done);
    });

    it('should destroy all workers', function(done) {
      pool = createPool();
      pool.ensureMinimumWorkers(3).then(function() {
        return pool.shutdown();
      }).then(function() {
        pool.workerCount().should.equal(0);
        done();
      }).fail(done);
    });
  });

  describe('event', function() {

    describe('worker:pool:available', function() {

      it('should emit when pool first available', function(done) {
        pool = createPool();
        testEmitter.on("worker:pool:available", function() {
          done();
        });
        pool.addWorker();
      });

      it('should emit when pool returns to available', function(done) {
        pool = createPool({
          maxConcurrentCallsPerWorker: 1
        });

        var calls = 0;
        testEmitter.on("worker:pool:available", function() {
          if (++calls == 2) {
            done();
          }
        });

        pool.addWorker().then(function(worker) {
          worker.invoke('returnResult');
        });
      });

    });

    describe('worker:pool:unavailable', function() {

      it('should emit when pool first unavailable', function(done) {
        pool = createPool({
          maxConcurrentCallsPerWorker: 1
        });
        var availableCalled = false;
        testEmitter.on("worker:pool:available", function() {
          availableCalled = true;
        });
        testEmitter.on("worker:pool:unavailable", function() {
          availableCalled.should.be.true;
          done();
        });

        pool.addWorker().then(function(worker) {
          worker.invoke('returnResult');
        });
      });

      it('should emit when pool returns to unavailable', function(done) {
        pool = createPool({
          maxConcurrentCallsPerWorker: 1
        });

        var calls = 0;
        testEmitter.on("worker:pool:unavailable", function() {
          if (++calls == 2) {
            done();
          }
        });

        pool.addWorker().then(function(worker) {
          worker.invoke('returnResult').then(function() {
            worker.invoke('returnResult');
          });
        });
      });

    });

  });

});
