"use strict";

const chai = require('chai');
const assert = require('assert');

const util = require('../../lib/util');

chai.should();

describe('util', function() {

  describe('#createAtCapacityStrategyForName', function() {
    it('should create a drop strategy', function() {
      var s = util.createAtCapacityStrategyForName('drop', {}, {}, {});
      s.should.be.an.instanceof(require('../../lib/at-capacity-strategy/drop'));
    });

    it('should create an error strategy', function() {
      var s = util.createAtCapacityStrategyForName('error', {}, {}, {});
      s.should.be.an.instanceof(require('../../lib/at-capacity-strategy/error'));
    });

    it('should create a queue strategy', function() {
      var s = util.createAtCapacityStrategyForName('queue', {}, {}, {});
      s.should.be.an.instanceof(require('../../lib/at-capacity-strategy/queue'));
    });

    it('should create a strategy from a function', function() {
      var s = util.createAtCapacityStrategyForName(function() {
        return 'foo';
      }, {}, {}, {});
      s.should.equal('foo');
    });

    it('should fail an invalid strategy name', function() {
      assert.throws(function() {
        util.createAtCapacityStrategyForName('dronkey', {}, {}, {});
      }, Error);
    });
  });

  describe('#createLoadStrategyForName', function() {
    it('should create a basic strategy', function() {
      var s = util.createLoadStrategyForName('basic', {}, {}, {});
      s.should.be.an.instanceof(require('../../lib/load-strategy/basic'));
    });

    it('should create a strategy from a function', function() {
      var s = util.createLoadStrategyForName(function() {
        return 'foo';
      }, {}, {}, {});
      s.should.equal('foo');
    });

    it('should fail an invalid strategy name', function() {
      assert.throws(function() {
        util.createLoadStrategyForName('dronkey', {}, {}, {});
      }, Error);
    });
  });

  describe('#deserializeError', function() {

    it('should deserialize standard error types', function() {
      util.deserializeError({ type: 'Error' }).should.be.an.instanceof(Error);
      util.deserializeError({ type: 'TypeError' }).should.be.an.instanceof(TypeError);
      util.deserializeError({ type: 'RangeError' }).should.be.an.instanceof(RangeError);
      util.deserializeError({ type: 'EvalError' }).should.be.an.instanceof(EvalError);
      util.deserializeError({ type: 'ReferenceError' }).should.be.an.instanceof(ReferenceError);
      util.deserializeError({ type: 'SyntaxError' }).should.be.an.instanceof(SyntaxError);
    });

    it('should propagate message', function() {
      util.deserializeError({ type: 'Error', message: 'foo' }).message.should.equal('foo');
    });

    it('should propagate stack', function() {
      util.deserializeError({ type: 'Error', stack: 'foo' }).stack.should.equal('foo');
    });
  });


  describe('#validateOptions', function() {

    var joi = require('joi');

    it('should validate valid options', function() {
      util.validateOptions({}, {});
    });

    it('should fail invalid options', function() {
      const schema = joi.compile({
        foo: joi.number()
      });

      assert.throws(function() {
        util.validateOptions({ foo: 'bar' }, schema);
      }, Error);
    });

  });

});
