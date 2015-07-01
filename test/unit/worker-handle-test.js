var EventEmitter = require('events').EventEmitter;
var assert = require('assert');

var Q = require('q');
var chai = require('chai');
var should = chai.should();
var expect = chai.expect;
var WorkerHandle = require('../../lib/worker-handle');
var testWorkerPath = require.resolve('../fixtures/test-worker');

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
          reply.iface.should.deep.equal([ 'hello', 'returnError', 'throwError', 'waitFor' ]);
          done();
        }).fail(done);
    });
  });

  describe("#invoke", function() {

    it('should call a worker method', function(done) {
      wh = createWH(1);
      wh.fork()
        .then(function() {
          return wh.invoke('hello', 'foo');
        })
        .then(function(reply) {
          reply.should.equal('received: foo');
          done();
        }).fail(done);
    });

  });

});
