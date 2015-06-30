var assert = require('assert');
var should = require('chai').should();
var Pipe = require('../../lib/pipe');

function createPipe(options) {
  options = options || {};
  options.maxPending = options.maxPending || 1;

  return new Pipe(options);
}

describe('pipe', function() {

  it('should have a predictable initial state', function() {
    var p = createPipe();

    p.atCapacity().should.be.false;
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
        })
      });

      p.send({ foo: 'bar' }).then(function(reply) {
        reply.should.deep.equal({ foo: 'bar' });
        done();
      });
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
          })
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
      });

      p.queued().should.equal(1);
      p.pending().should.equal(1);
    });

    it('should be rejected when flushing', function() {
      // TODO: should this be a thing?
    });

  });

  describe("#flush", function() {

    it('should resolve immediately when no pending and queued', function(done) {
      var p = createPipe();
      p.flush().then(done);
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
          })
        }, 0);
      });

      p.send({ foo: 'bar' });
      p.flush().then(function() {
        p.queued().should.equal(0);
        p.pending().should.equal(0);
        done();
      });
    });

    it('should resolve when pending and queued', function() {

      var p = createPipe();
      var receiver = p.receiver();

      p.sender(function(data) {
        // Echo back to the receiver later
        setTimeout(function() {
          receiver({
            id: data.id,
            message: data.message
          })
        }, 0);
      });

      p.send({ foo: 'bar' });
      p.send({ bar: 'baz' });

      p.flush().then(function() {
        p.queued().should.equal(0);
        p.pending().should.equal(0);
        done();
      });
    });

  });

});
