/*jshint -W030 */
"use strict";

const Whipper = require('../..');
const assert = require('assert');

const testWorkerPath = require.resolve('../fixtures/test-worker');

var whipper;

function createWhipper(options) {
  options = options || {};
  options.workerModulePath = testWorkerPath;
  //options.logger = console.log;

  whipper = new Whipper(options);
}

function ensureWorkerConstraints(whipperOpts) {
  var workerCount = whipper.workerCount();
  if (workerCount > whipperOpts.maxWorkers) {
    assert.fail("Worker count exceeds max allowed workers of: " + whipperOpts.maxWorkers);
  }
  if (workerCount < whipperOpts.minWorkers) {
    assert.fail("Worker count less than min allowed workers of: " + whipperOpts.minWorkers);
  }
  // TODO: check max concurrent
}

function expectReplies(whipperOpts, calls, done) {

  var i;
  var remainingReplies = {};

  for (i = 0; i < calls; i++) {
    remainingReplies[i] = true;
  }

  function handleReply(reply) {
    ensureWorkerConstraints(whipperOpts);

    delete remainingReplies[reply];
    if (Object.keys(remainingReplies).length === 0) {
      done();
    }
  }

  for (i = 0; i < calls; i++) {
    whipper.invoke('returnResult', [ i ]).then(handleReply).catch(done);
  }
}

function testConcurrency(whipperOpts, calls, done) {
  createWhipper(whipperOpts);
  expectReplies(whipperOpts, calls, done);
}

describe('whipper integration', function() {

  afterEach(function(done) {
    whipper.shutdown().then(function() {
      done();
    }).catch(done);
  });


  it('should handle one call', function(done) {
    testConcurrency({
      minWorkers: 1,
      maxWorkers: 1,
      maxConcurrentCalls: 1
    }, 1, done);
  });


  describe('horizontal concurrency', function() {

    it('should handle calls less than max workers', function(done) {
      testConcurrency({
        minWorkers: 1,
        maxWorkers: 10,
        maxConcurrentCalls: 1
      }, 5, done);
    });

    it('should handle calls equal to max workers', function(done) {
      testConcurrency({
        minWorkers: 1,
        maxWorkers: 10,
        maxConcurrentCalls: 1
      }, 10, done);
    });

    it('should handle calls greater than max workers', function(done) {
      testConcurrency({
        minWorkers: 1,
        maxWorkers: 5,
        maxConcurrentCalls: 1
      }, 10, done);
    });
  });

  describe("vertical concurrency", function() {

    it('should handle calls less than max concurrent', function(done) {
      testConcurrency({
        minWorkers: 1,
        maxWorkers: 1,
        maxConcurrentCalls: 10
      }, 5, done);
    });

    it('should handle calls equal to max concurrent', function(done) {
      testConcurrency({
        minWorkers: 1,
        maxWorkers: 1,
        maxConcurrentCalls: 10
      }, 10, done);
    });

    it('should handle calls greater than max concurrent', function(done) {
      testConcurrency({
        minWorkers: 1,
        maxWorkers: 1,
        maxConcurrentCalls: 5
      }, 10, done);
    });

  });

  // TODO: This load test doesn't belong here.
  /*describe("load", function() {

    this.timeout(20000);

    it('should handle shit loads of calls', function(done) {

      var expectedCalls = 5000;
      var receivedReplies = 0;
      var batchSize = 100;

      createWhipper({
        minWorkers: 1,
        maxWorkers: 10,
        maxConcurrentCalls: 5
      });

      var i = 0;

      function doNextBatch() {

        if (i >= expectedCalls) {
          return;
        }

        var z = 0;
        while (i < expectedCalls && z++ < batchSize) {
          i++;
          whipper.invoke('returnResult', [ i ]).then(function(reply) {
            receivedReplies++;

            if (receivedReplies >= expectedCalls) {
              done();
            }
          });
        }

        process.nextTick(doNextBatch);
      }

      doNextBatch();
    });

  });*/

});
