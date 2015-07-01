var EventEmitter = require('events').EventEmitter;
var assert = require('assert');

var Q = require('q');
var chai = require('chai');
var should = chai.should();
var expect = chai.expect;

var WorkerHandle = require('../../lib/worker-handle');
var InvocationTimeoutError = require('../../lib/error/invocation-timeout-error');
var testUtil = require('../util');
var testWorkerPath = require.resolve('../fixtures/test-worker');

var testWorkerInterface = testUtil.getTestWorkerInterface();
var testEmitter;
var wh;

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
  options.maxPending = options.maxPending || 1;

  options.workerModulePath = testWorkerPath;
  options.logger = console.log;

  return new WorkerHandle(id, testEmitter, options);
}


describe('worker-handle', function() {

  beforeEach(function() {
    testEmitter = new EventEmitter();
  });

  afterEach(function() {
    wh = null;
  });

  it('should have a predictable initial state', function() {
    wh = createWH(123);
    wh.id().should.equal(123);
    expect(wh.pid()).to.be.null;
    wh.state().should.equal(WorkerHandle.State.created);
    expect(wh.exitCode()).to.be.null;

    wh.isIdle().should.be.true;
    wh.queuedCalls().should.equal(0);
    wh.atCapacity().should.be.false;
    wh.isAvailable().should.be.false;
  });

  describe("#fork", function() {

    it('should create a child process', function(done) {
      wh = createWH(1);
      wh.fork().then(function() {

        wh.pid().should.be.above(0);
        isProcessRunning(wh.pid()).should.be.true;
        wh.state().should.equal(WorkerHandle.State.processing);
        wh.isAvailable().should.be.true;

        done();
      }).fail(done);

      wh.state().should.equal(WorkerHandle.State.forking);
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
        }).fail(done);
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
          reply.should.equal('received: foo');
          done();
        }).fail(done);
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
        }).fail(done);
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
        }).fail(done);
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
      expectError('waitFor', [ 700 ], InvocationTimeoutError, undefined, done);
    });

  });

});
