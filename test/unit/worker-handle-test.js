/*jshint -W030 */
"use strict";

const EventEmitter = require('events').EventEmitter;

const Q = require('q');
const chai = require('chai');
const expect = chai.expect;

const WorkerHandle = require('../../lib/worker-handle');
const TimeoutError = require('../../lib/error/timeout-error');
const testUtil = require('../util');
const testWorkerPath = require.resolve('../fixtures/test-worker');

const testWorkerInterface = testUtil.getTestWorkerInterface();

var testEmitter;
var wh;

const cbGrace = 250;

chai.should();
Q.longStackSupport = true;

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

function createWH(id, options) {
  options = options || {};
  options.maxConcurrentCalls = options.maxConcurrentCalls || 1;

  options.workerModulePath = testWorkerPath;
  //options.logger = console.log;

  return new WorkerHandle(id, testEmitter, options);
}


describe('worker-handle', function() {

  var pids = [];

  beforeEach(function() {
    testEmitter = new EventEmitter();
    testEmitter.once("worker:process:created", function(worker) {
      pids.push(worker.pid());
    });
  });

  afterEach(function() {
    pids.forEach(function(pid) {
      testUtil.forceKill(pid);
    });
    wh = null;
  });

  it('should have a predictable initial state', function() {
    wh = createWH(123);
    wh.id().should.equal(123);
    expect(wh.pid()).to.be.null;
    wh.state().should.equal(WorkerHandle.State.created);
    wh.workingStatus().should.equal(WorkerHandle.WorkingStatus.idle);
    expect(wh.exitCode()).to.be.null;
    expect(wh.exitSignal()).to.be.null;
    wh.pendingCalls().should.equal(0);
    wh.queuedCalls().should.equal(0);
  });

  it('should timeout after configured inactivity period', function(done) {

    var to = 500;
    var timedOut = false;
    testEmitter.on("worker:inactivity-timeout", function() {
      timedOut = true;
    });
    testEmitter.on("worker:state:destroying", function() {
      timedOut.should.be.true;

      var elapsed = Date.now() - startTime;
      elapsed.should.be.gte(to);
      elapsed.should.be.lte(to + cbGrace);
      done();
    });

    var startTime = Date.now();
    wh = createWH(123, {
      inactivityTimeout: to
    });

    wh.fork()
      .fail(done);
  });

  describe("#fork", function() {

    it('should create a child process', function(done) {
      wh = createWH(1);
      wh.fork()
        .then(function() {
          wh.pid().should.be.above(0);
          isProcessRunning(wh.pid()).should.be.true;
          wh.state().should.equal(WorkerHandle.State.processing);
          wh.workingStatus().should.equal(WorkerHandle.WorkingStatus.idle);

          wh.pendingCalls().should.equal(0);
          wh.queuedCalls().should.equal(0);
          done();
        })
        .fail(done);

      wh.state().should.equal(WorkerHandle.State.forking);
    });

    it('should emit state changed events', function(done) {
      wh = createWH(1);

      var forking = false;
      testEmitter.on("worker:state:forking", function() {
        forking = true;
      });
      testEmitter.on("worker:state:processing", function() {
        forking.should.be.true;
        done();
      });

      wh.fork()
        .fail(done);
    });
  });

  describe("#discoverInterface", function() {

    it('should discover the worker interface', function(done) {
      wh = createWH(1);
      wh.fork()
        .then(function() {
          return wh.discoverInterface();
        })
        .then(function(reply) {
          reply.iface.should.deep.equal(testWorkerInterface);
          done();
        })
        .fail(done);
    });
  });

  describe("#invoke", function() {

    function expectResult(method, done) {
      if (!wh) {
        wh = createWH(1);
      }

      wh.fork()
        .then(function() {
          return wh.invoke(method, 'foo');
        })
        .then(function(reply) {
          reply.should.equal('foo');
          done();
        })
        .fail(done);
    }

    function expectError(method, args, expectedType, expectedMessage, done) {
      if (!wh) {
        wh = createWH(1);
      }

      wh.fork()
        .then(function() {
          return wh.invoke(method, args);
        })
        .then(function(reply) {
          done(new Error("Call succeeded: ", reply));
        })
        .fail(function(err) {
          // We can't throw an exception in here and see the result in test output
          // because we're already in the fail() handler. So, call done with an Error for failed assertions.
          if (!err) {
            return done(new Error("Did not receive an error"));
          }
          if (!(err instanceof expectedType)) {
            return done(new Error("Did not receive error type " + expectedType.type + ": " + err));
          }
          if (err.message !== expectedMessage) {
            return done(new Error("Unexpected reply error message: " + err.message));
          }
          done();
        });
    }

    it('should succeed calling a worker method that returns a result', function(done) {
      expectResult('returnResult', done);
    });

    it('should succeed calling a worker method that returns two results', function(done) {
      wh = createWH(1);
      wh.fork()
        .then(function() {
          return wh.invoke('returnTwoResults', [ 'foo', 'bar' ]);
        })
        .then(function(reply) {
          reply.should.deep.equal([ 'foo', 'bar' ]);
          done();
        })
        .fail(done);
    });

    it('should succeed calling a worker method that returns three results', function(done) {
      wh = createWH(1);
      wh.fork()
        .then(function() {
          return wh.invoke('returnThreeResults', [ 'foo', 'bar', 'baz' ]);
        })
        .then(function(reply) {
          reply.should.deep.equal([ 'foo', 'bar', 'baz' ]);
          done();
        })
        .fail(done);
    });

    it('should succeed calling a worker method that calls back a result now', function(done) {
      expectResult('callbackResultNow', done);
    });

    it('should succeed calling a worker method that calls back a result later', function(done) {
      expectResult('callbackResultLater', done);
    });

    it('should succeed calling a worker method that promises a result now', function(done) {
      expectResult('promiseResultNow', done);
    });

    it('should succeed calling a worker method that promises a result later', function(done) {
      expectResult('promiseResultLater', done);
    });

    it('should fail calling a non-existent method', function(done) {
      expectError('garbage', [], Error, 'Worker method not found: garbage', done);
    });

    it('should fail calling a worker method that returns an error', function(done) {
      expectError('returnError', [], Error, 'I suck', done);
    });

    it('should fail calling a worker method that throws an error', function(done) {
      expectError('throwError', [], Error, 'I suck', done);
    });

    it('should fail calling a worker method that calls back an error now', function(done) {
      expectError('callbackErrorNow', [], Error, 'I suck', done);
    });

    it('should fail calling a worker method that calls back an error later', function(done) {
      expectError('callbackErrorLater', [], Error, 'I suck', done);
    });

    it('should fail calling a worker method that promises an error now', function(done) {
      expectError('promiseErrorNow', [], Error, 'I suck', done);
    });

    it('should fail calling a worker method that promises an error later', function(done) {
      expectError('promiseErrorLater', [], Error, 'I suck', done);
    });

    it('should fail calling a worker method that takes longer to complete than the configured timeout', function(done) {
      wh = createWH(1, {
        invocationTimeout: 500
      });
      expectError('waitFor', [ 700 ], TimeoutError, undefined, done);
    });

    it('should reset when maxTotalCalls exceeded', function(done) {
      wh = createWH(1, {
        maxTotalCalls: 2
      });

      wh.fork()
        .then(function() {
          var pid = wh.pid();
          var reply1 = false;
          var reply2 = false;
          var reply3 = false;
          var exited = false;

          testEmitter.on("worker:process:exited", function() {
            reply1.should.be.true;
            reply2.should.be.true;
            reply3.should.be.true;
            exited = true;
          });

          testEmitter.on("worker:process:created", function() {
            exited.should.be.true;
            pid.should.not.equal(wh.pid());
            done();
          });

          wh.invoke('returnResult', 1)
            .then(function() {
              reply1 = true;
              pid.should.equal(wh.pid());
            })
            .fail(done);
          wh.invoke('returnResult', 2)
            .then(function() {
              reply2 = true;
              pid.should.equal(wh.pid());
            })
            .fail(done);
          wh.invoke('returnResult', 3)
            .then(function() {
              reply3 = true;
              reply1.should.be.true;
              reply2.should.be.true;
              pid.should.equal(wh.pid());
            })
            .fail(done);
        })
        .fail(done);
    });

  });

  describe('#flush', function() {

    it('should resolve when no calls pending or queued', function(done) {
      wh = createWH(1);
      wh.fork()
        .then(function() {
          wh.pendingCalls().should.equal(0);
          wh.queuedCalls().should.equal(0);

          wh.flush()
            .then(function() {
              wh.state().should.equal(WorkerHandle.State.processing);
              wh.pendingCalls().should.equal(0);
              wh.queuedCalls().should.equal(0);
              done();
            })
            .fail(done);

          wh.state().should.equal(WorkerHandle.State.flushing);
        })
        .fail(done);
    });

    it('should resolve after pending calls complete', function(done) {
      wh = createWH(1);
      wh.fork()
        .then(function() {
          wh.invoke('waitFor', [ 100 ]);

          wh.pendingCalls().should.equal(1);
          wh.queuedCalls().should.equal(0);

          wh.flush()
            .then(function() {
              wh.state().should.equal(WorkerHandle.State.processing);
              wh.pendingCalls().should.equal(0);
              wh.queuedCalls().should.equal(0);
              done();
            })
            .fail(done);

          wh.state().should.equal(WorkerHandle.State.flushing);
        })
        .fail(done);
    });

    it('should resolve after queued calls complete', function(done) {
      wh = createWH(1);
      wh.fork()
        .then(function() {
          wh.invoke('waitFor', [ 100 ]);
          wh.invoke('waitFor', [ 200 ]);
          wh.invoke('waitFor', [ 300 ]);

          wh.pendingCalls().should.equal(1);
          wh.queuedCalls().should.equal(2);

          wh.flush()
            .then(function() {
              wh.state().should.equal(WorkerHandle.State.processing);
              wh.pendingCalls().should.equal(0);
              wh.queuedCalls().should.equal(0);
              done();
            })
            .fail(done);

          wh.state().should.equal(WorkerHandle.State.flushing);
        })
        .fail(done);

    });

    it('should emit state changed events', function(done) {
      wh = createWH(1);

      testEmitter.on("worker:state:flushing", function() {
        testEmitter.on("worker:state:processing", function() {
          done();
        });
      });

      wh.fork()
        .then(function() {
            wh.flush()
              .fail(done);
        })
        .fail(done);
    });
  });

  describe("#kill", function() {

    it('should gracefully kill the existing process', function(done) {
      wh = createWH(1);
      wh.fork()
        .then(function() {
          var pid = wh.pid();
          wh.kill().then(function(worker) {
            worker.should.equal(wh);
            isProcessRunning(pid).should.be.false;
            done();
          })
          .fail(done);

          isProcessRunning(pid).should.be.true;
          wh.state().should.equal(WorkerHandle.State.dying);
        })
        .fail(done);
    });

    it('should force kill the existing process after forceKillTimeout', function(done) {

      var to = 500;

      wh = createWH(1, {
        forceKillTimeout: to
      });
      wh.fork()
        .then(function() {
          return wh.invoke('spin');
        })
        .then(function() {
          var pid = wh.pid();

          var killStart = Date.now();
          wh.kill()
            .then(function() {
              var killEnd = Date.now();
              var killTime = (killEnd - killStart);

              isProcessRunning(pid).should.be.false;
              killTime.should.be.above(to);
              killTime.should.be.below(to + cbGrace);

              done();
            })
            .fail(done);

          isProcessRunning(pid).should.be.true;
          wh.state().should.equal(WorkerHandle.State.dying);
        })
        .fail(done);
    });

    it('should force kill the existing process', function(done) {
      wh = createWH(1);
      wh.fork()
        .then(function() {
          return wh.invoke('spin');
        })
        .then(function() {
          var pid = wh.pid();

          var killStart = Date.now();
          wh.kill(true)
            .then(function() {
              var killEnd = Date.now();
              var killTime = (killEnd - killStart);

              isProcessRunning(pid).should.be.false;
              killTime.should.be.above(0);
              killTime.should.be.below(cbGrace);
              done();
            })
            .fail(done);

          isProcessRunning(pid).should.be.true;
          wh.state().should.equal(WorkerHandle.State.dying);
        })
        .fail(done);
    });

    it('should emit state changed when graceful', function(done) {

      var dying = false;

      wh = createWH(1);
      wh.fork()
        .then(function() {

          testEmitter.on('worker:state:dying', function() {
            dying = true;
          });

          wh.kill(true)
            .then(function() {
              dying.should.be.true;
              done();
            })
            .fail(done);
        })
        .fail(done);
    });

    it('should emit state changed events when forced', function(done) {

      var dying = false;

      wh = createWH(1);
      wh.fork()
        .then(function() {

          testEmitter.on('worker:state:dying', function() {
            dying = true;
          });

          wh.kill(true)
            .then(function() {
              dying.should.be.true;
              done();
            })
            .fail(done);
        })
        .fail(done);
    });
  });

  describe("#reset", function() {

    it('should roll the child process', function(done) {
      wh = createWH(1);
      wh.fork()
        .then(function() {
          var pid = wh.pid();
          pid.should.be.a.number;

          wh.reset()
            .then(function() {
              var newPid = wh.pid();
              newPid.should.be.a.number;
              pid.should.not.equal(newPid);
              done();
            })
            .fail(done);
        })
        .fail(done);
    });

    it('should flush pending and queued calls', function(done) {
      wh = createWH(1);
      wh.fork()
        .then(function() {
          wh.invoke('returnResult', 'foo');
          wh.invoke('returnResult', 'bar');

          wh.pendingCalls().should.equal(1);
          wh.queuedCalls().should.equal(1);

          wh.reset()
            .then(function() {
              wh.pendingCalls().should.equal(0);
              wh.queuedCalls().should.equal(0);

              done();
            })
            .fail(done);
        })
        .fail(done);
    });

  });

  describe("#resetNeeded", function() {

    it('should return false after initialization', function() {
      wh = createWH(1);
      wh.resetNeeded().should.be.false;
    });

    it('should return true after maxTotalCallsPerWorker exceeded', function(done) {
      wh = createWH(1, {
        maxTotalCalls: 2
      });

      wh.fork()
        .then(function() {
          wh.invoke('returnValue');
          wh.resetNeeded().should.be.false;
          wh.invoke('returnValue');
          wh.resetNeeded().should.be.true;
          wh.invoke('returnValue');
          wh.resetNeeded().should.be.true;
          done();
        })
        .fail(done);
    });

  });

  describe("#stats", function() {

    it('should reflect initial state', function() {
      wh = createWH(1);
      wh.stats().should.deep.equal({
        callsHandled: 0,
        errorCount: 0,
        forkCount: 0,
        maxSeenConcurrentCalls: 0,
        resetCount: 0
      });
    });

    it('should reflect fork count', function(done) {

      wh = createWH(1);

      wh.fork()
        .then(function() {
          wh.invoke('returnValue');
          wh.stats().forkCount.should.equal(1);
          done();
        })
        .fail(done);
    });

    it('should reflect call count', function(done) {
      wh = createWH(1);

      wh.fork()
        .then(function() {
          wh.invoke('returnValue');
          wh.stats().callsHandled.should.equal(1);
          done();
        })
        .fail(done);
    });


  });

});
