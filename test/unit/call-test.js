"use-strict";

const chai = require('chai');
var Call = require('../../lib/call');

chai.should();

describe('call', function() {

  it('should store args parameter', function() {
    new Call('foo', [ 'bar' ]).args.should.deep.equal([ 'bar' ]);
  });

  it('should normalize args parameter', function() {
    new Call('foo').args.should.deep.equal([]);
    new Call('foo', 'bar').args.should.deep.equal([ 'bar' ]);
  });

  it('should store method parameter', function() {
    new Call('foo').method.should.deep.equal('foo');
  });

  it('should create and store a deferred', function() {
    var c = new Call('foo');
    c.deferred.resolve.should.be.a('function');
  });

  describe('#invoke', function() {

    it('should invoke the passed worker', function() {

      var c = new Call('foo', [ 'bar' ]);

      var p = c.invoke({
        invoke: function(method, args) {
          method.should.equal('foo');
          args.should.deep.equal([ 'bar' ]);

          return {
            then: function(cb) {
              cb('result');
              return this;
            },
            fail: function(cb) {
              cb();
            }
          };
        }
      });

      p.should.equal(c.deferred.promise);

      p.then(function(result) {
        result.should.equal('result');
      });
    });

  });

  describe('#toString', function() {

    it('should return a string representation', function() {
      new Call('foo', [ 'bar' ]).toString().should.equal('Call[method=foo,args=["bar"]]');
    });

  });

});
