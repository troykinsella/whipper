var EventEmitter = require('events').EventEmitter;
var assert = require('assert');

var chai = require('chai');
var should = chai.should();
var expect = chai.expect;
var WorkerHandle = require('../../lib/worker-handle');

var testEmitter;

function createWH(id, options) {
  options = options || {};
  options.maxPending = options.maxPending || 1;

  return new WorkerHandle(id, testEmitter, options);
}


describe('worker-handle', function() {

  beforeEach(function() {
    testEmitter = new EventEmitter();
  });

  it('should have a predictable initial state', function() {
    var wh = createWH(123);
    wh.id().should.equal(123);
    expect(wh.pid()).to.be.null;
    wh.state().should.equal(WorkerHandle.State.created);
    expect(wh.exitCode()).to.be.null;

    wh.isIdle().should.be.true;
    wh.queuedCalls().should.equal(0);
    wh.atCapacity().should.be.false;
    wh.isAvailable().should.be.false;
  });


});
