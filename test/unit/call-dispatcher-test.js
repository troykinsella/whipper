/*jshint -W030 */
"use strict";

var EventEmitter = require('events').EventEmitter;
var assert = require('assert');

var chai = require('chai');

var Call = require('../../lib/call');
var CallDispatcher = require('../../lib/call-dispatcher');

chai.should();

var cd;
var testEmitter;
var mockLoadStrategy;
var mockAtCapacityStrategy;

function createCD(options) {
  options = options || {};

  //options.logger = console.log;

  cd = new CallDispatcher(mockLoadStrategy, mockAtCapacityStrategy, testEmitter, options);
}

describe('call-dispatcher', function() {

  beforeEach(function() {
    testEmitter = new EventEmitter();
  });

  afterEach(function() {
    mockLoadStrategy = null;
    mockAtCapacityStrategy = null;
  });

  describe('#dispatch', function() {

    it('should invoke call when not at capacity and no queued calls', function(done) {

      mockLoadStrategy = {
        atCapacity: function() {
          return false;
        },
        selectWorker: function() {
          return {
            then: function(cb) {
              cb({}); // Mock worker-handle
              return this;
            },
            catch: function() {}
          };
        }
      };

      createCD();

      var c = new Call('foo', 'bar');
      c.invoke = function() {
        done();
      };

      cd.dispatch(c);
    });

    it('should invoke all queued calls when not at capacity', function(done) {

      mockLoadStrategy = {
        atCapacity: function() {
          return false;
        },
        selectWorker: function() {
          return {
            then: function(cb) {
              cb({}); // Mock worker-handle
              return this;
            },
            catch: function() {}
          };
        }
      };

      createCD();

      var c1Called = false;
      var c2Called = false;

      var c1 = new Call('foo', 'bar');
      c1.invoke = function() {
        c1Called = true;
      };

      var c2 = new Call('bar', 'baz');
      c2.invoke = function() {
        c2Called = true;
      };

      var c3 = new Call('baz', 'wut');
      c3.invoke = function() {
        c1Called.should.be.true;
        c2Called.should.be.true;
        done();
      };

      cd.dispatch(c1);
      cd.dispatch(c2);
      cd.dispatch(c3);
    });

    it('should reject the call with a misbehaving load strategy', function(done) {

      mockLoadStrategy = {
        atCapacity: function() {
          return false; // Say we're not at capacity
        },
        selectWorker: function() {
          return {
            then: function(cb) {
              cb(null); // But then don't resolve a worker
              return this;
            },
            catch: function(cb) {}
          };
        }
      };

      createCD();

      var c = new Call('foo', 'bar');
      c.invoke = function() {
        assert.fail("Call invoked in error condition");
      };

      c.promise.catch(function(err) {
        err.should.be.an('Error');
        done();
      });

      cd.dispatch(c);

    });


    it('should invoke at-capacity-strategy when at capacity', function(done) {

      mockLoadStrategy = {
        atCapacity: function() {
          return true;
        }
      };

      mockAtCapacityStrategy = {
        handle: function(call) {
          call.should.equal(c);
          done();
        }
      };

      createCD();

      var c = new Call('foo', 'bar');
      cd.dispatch(c);
    });

    it('should pause processing when at-capacity-strategy does not handle call', function(done) {

      var atCapacity = true;

      mockLoadStrategy = {
        atCapacity: function() {
          return atCapacity;
        },
        selectWorker: function() {
          return {
            then: function(cb) {
              cb({});
              return this;
            },
            catch: function(cb) {}
          };
        }
      };

      mockAtCapacityStrategy = {
        handle: function(call) {
          return false;
        }
      };

      createCD();

      var c = new Call('foo', 'bar');
      c.invoke = function() {
        atCapacity.should.be.false;
        done();
      };

      cd.dispatch(c);

      process.nextTick(function() {
        // Signal that we are no longer at capacity
        atCapacity = false;
        testEmitter.emit("worker:pool:available");
      });
    });

  });

});
