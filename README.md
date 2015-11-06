# whipper
> A child process management library for node.js

[![NPM version][npm-image]][npm-url] [![Build Status][travis-image]][travis-url]

## What Whipper Does

Whipper lets you delegate work to a managed pool of worker child processes.
It gives you a rich, streamlined API for manipulating worker pools and individual workers,
and provides the fault tolerance so you can focus on your business logic.

A whipper worker is an abstraction on top of child processes in that it may have 
many during its lifetime, but only one at a time. If configured to do so, a worker 
will re-fork the underlying process if it was killed externally, or by error,
or any other means. It can process one call at a time, or however many you specify in parallel.

A whipper pool manages a bunch of these workers, doing things like distributing
the work load according to a configurable strategy, and managing when
workers are created and destroyed.

## Install

```sh
$ npm install --save whipper
```

## Usage

First, define a worker module:
```js
// my-worker.js

module.exports = {
  sayHi: function(person) {
    return Array(400).join('hi ' + person);
  }
};
```

Create a whipper pool with basic configuration:

```js
// app.js

var Whipper = require('whipper');

var whipper = new Whipper({

  // Required: The path to your worker module
  workerModulePath: require.resolve('./my-worker'),

  // The minimum number of child processes to be kept alive at all times
  minWorkers: 2,

  // The maximum number of child processes
  maxWorkers: 16,

  // The maximum number of calls a single worker will handle at a time
  maxConcurrentCalls: 4,

  // Timeout if worker calls take longer than...
  invocationTimeout: 60000,

  // Specify what to do with a call when all workers are busy
  atCapacityStrategy: "queue", // or "drop", "error"

  // Access logging output
  logger: function(level, message) {
    console.log("whipper: ["+ level + "] " + message);
  }

  // More docs. Coming soon.
});
```

Listen to what's going on:

```js
whipper
  .on("worker:pool:available", function() {
    console.log("Ah yeah, some workers are available");
  })
  .on("worker:pool:unavailable", function() {
    console.log("Shit! All the workers are busy!");
  })
  .on("worker:process:created", function(worker) {
    console.log("Get to work!", worker.pid());
  })
  .on("worker:process:exited", function() {
    console.log("You're fired!", worker.pid());
  })
  .on("worker:state:changed", function(worker) {
    console.log("Worker now in state: ", worker.state());
    /* Will print one of these states: 
      created
      forking
      processing
      flushing
      dying
      destroying
    */
  });
```

Inovke a worker function:

```js
whipper.invoke("sayHi", "Winfred").then(function(result) {
  console.log(result);
}).fail(function(err) {
  console.log("Fine. Be that way.", err.message);
})
```
The output of this call would normally be: `"hi Winfred hi Winfred hi Winfred..."` (times a bajillion)

Or, create a proxy to the worker interface:

```js
whipper.workerProxy().then(function(worker) {
  worker.sayHi("Ted").then(function(result) {
    console.log("Worker said:", result);
  });
});
```

Get a bunch of information out of whipper:
```js
console.log(whipper.stats());
```
... which would output something like:
```js
{
  atCapacityWorkerCount: 2,
  busyWorkerCount: 4,
  idleWorkerCount: 6,
  maxSeenWorkerCount: 20,
  workerCount: 10,
  workers: {
    callsHandled: 446,
    errorCount: 3,
    forkCount: 20,
    maxSeenConcurrentCalls: 6,
    resetCount: 0
  }
}
```

## Road Map

* Way more documentation
* Published jsdoc
* Published test coverage reports
* Synchronous proxy creation
* Support for passing socket objects, like the standard child api

## Versioning

While in the 0.x.x range of versions, which denote alpha status, releases may introduce backwards incompatible changes.
Following a 1.x.x release, standard semantic versioning will apply regarding public api-breaking changes.

## License

MIT © [Troy Kinsella]()


[npm-image]: https://badge.fury.io/js/whipper.svg
[npm-url]: https://npmjs.org/package/whipper
[travis-image]: https://travis-ci.org/troykinsella/whipper.svg?branch=master
[travis-url]: https://travis-ci.org/troykinsella/whipper

