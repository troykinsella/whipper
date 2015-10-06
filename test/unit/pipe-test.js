/*jshint -W030 */
"use strict";

const Q = require('q');
const chai = require('chai');
const assert = require('assert');
const Pipe = require('../../lib/pipe');
const TimeoutError = require('../../lib/error/timeout-error');

chai.should();
Q.longStackSupport = true;

function createPipe(options) {
  options = options || {};
  options.maxPending = options.maxPending || 1;

  return new Pipe(options);
}

describe('pipe', function() {

  it('should have a predictable initial state', function() {
    var p = createPipe();

    p.isIdle().should.be.true;
    p.atMaxPending().should.be.false;
    p.pending().should.equal(0);
    p.queued().should.equal(0);
    p.flushing().should.be.false;
  });

  describe('#send', function() {

    it('should do nothing when passed empty arguments', function() {
      var p = createPipe();
      p.sender(function() {
        assert.fail();
      });

      p.send();
      p.send(undefined);
      p.send(null);

      p.pending().should.equal(0);
      p.queued().should.equal(0);
    });

    it('should invoke the sender function', function(done) {
      var p = createPipe();
      p.sender(function(data) {
        p.pending().should.equal(1);
        p.queued().should.equal(0);
        data.id.should.equal(0);
        data.message.should.deep.equal({ foo: 'bar' });
        done();
      });

      p.send({ foo: 'bar' });
    });

    it('should invoke the callback when receiver called', function(done) {
      var p = createPipe();
      var receiver = p.receiver();

      p.sender(function(data) {
        // Echo back to the receiver
        receiver({
          id: data.id,
          message: data.message
        });
      });

      p.send({ foo: 'bar' }).then(function(reply) {
        reply.should.deep.equal({ foo: 'bar' });
        done();
      }).fail(done);
    });

    it('should begin queueing when maxPending met', function(done) {

      var p = createPipe();
      var receiver = p.receiver();

      p.sender(function(data) {
        // Echo back to the receiver later
        setTimeout(function() {
          receiver({
            id: data.id,
            message: data.message
          });
        }, 0);
      });

      p.send({ foo: 'bar' }).then(function(reply) {
        reply.should.deep.equal({ foo: 'bar' });
      });

      p.queued().should.equal(0);
      p.pending().should.equal(1);

      p.send({ bar: 'baz' }).then(function(reply) {
        reply.should.deep.equal({ bar: 'baz' });
        done();
      }).fail(done);

      p.queued().should.equal(1);
      p.pending().should.equal(1);
    });

    it('should be rejected when flushing', function(done) {
      var p = createPipe();
      var receiver = p.receiver();

      p.sender(function(data) {
        // Echo back to the receiver later
        setTimeout(function() {
          receiver({
            id: data.id,
            message: data.message
          });
        }, 0);
      });

      p.send({ foo: 'bar' });
      p.flush();
      p.send({ bar: 'baz' }).then(function(reply) {
        assert.fail("Send during flush succeeded");
      }).fail(function(err) {
        assert(err instanceof Error);
        done();
      });
    });

    it('should be rejected when message timed out', function(done) {
      var p = createPipe({
        pendingTimeout: 500
      });
      var receiver = p.receiver();

      p.sender(function(data) {
        // Echo back to the receiver later
        setTimeout(function() {
          receiver({
            id: data.id,
            message: data.message
          });
        }, 700);
      });

      p.send({ bar: 'baz' }).then(function(reply) {
        assert.fail("Send succeeded");
      }).fail(function(err) {
        assert(err instanceof TimeoutError);
        done();
      });
    });

  });

  describe("#flush", function() {

    it('should resolve immediately when no pending and queued', function(done) {
      var p = createPipe();
      p.flush().then(done).fail(done);
    });

    it('should resolve when pending returns and no queued', function(done) {
      var p = createPipe();
      var receiver = p.receiver();

      p.sender(function(data) {
        // Echo back to the receiver later
        setTimeout(function() {
          receiver({
            id: data.id,
            message: data.message
          });
        }, 0);
      });

      p.send({ foo: 'bar' })
        .fail(done);

      p.flush().then(function() {
        p.queued().should.equal(0);
        p.pending().should.equal(0);
        done();
      }).fail(done);
    });

    it('should resolve when pending and queued', function(done) {

      var p = createPipe();
      var receiver = p.receiver();

      p.sender(function(data) {
        // Echo back to the receiver later
        setTimeout(function() {
          receiver({
            id: data.id,
            message: data.message
          });
        }, 0);
      });

      p.send({ foo: 'bar' })
        .fail(done);
      p.send({ bar: 'baz' })
        .fail(done);

      p.flush().then(function() {
        p.queued().should.equal(0);
        p.pending().should.equal(0);
        done();
      }).fail(done);
    });

  });

});
