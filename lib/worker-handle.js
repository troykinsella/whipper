
const _ = require('lodash');
const Q = require('q');
const childProcess = require('child_process');
const workerWrapperPath = require.resolve('./worker-wrapper');
const Pipe = require('./pipe');

/**
 *
 * @param id
 * @param workerModulePath
 * @param options
 * @constructor
 */
function WorkerHandle(id, emitter, options) {
  this._id = id;
  this._emitter = emitter;
  this._options = options;

  this._exitCode = null;
  this._callsProcessed = 0;
  this._state = State.created;

  this._stats = {
    maxSeenConcurrentCalls: 0
  };

  this._pipe = new Pipe({
    maxPending: options.maxConcurrentCallsPerWorker,
    invocationTimeout: options.invocationTimeout,
    logger: options.logger
  });

  this._touch();
}

/**
 * State transition occurs generally in the order defined.
 */
const State = WorkerHandle.State = {
  created: "created",
  forking: "forking",
  processing: "processing",
  flushing: "flushing",
  dying: "dying",
  destroying: "destroying"
};

/**
 * Get the worker's ID.
 * @returns {*}
 */
WorkerHandle.prototype.id = function() {
  return this._id;
};

/**
 * Get the worker process PID.
 * @returns {*}
 */
WorkerHandle.prototype.pid = function() {
  return this._child ? this._child.pid : null;
};

/**
 * Get the worker state.
 * @see WorkerHandle.State
 * @returns {string}
 */
WorkerHandle.prototype.state = function() {
  return this._state;
};

/**
 *
 * @param state
 * @private
 */
WorkerHandle.prototype._setState = function(state) {
  var oldState = this._state;
  this._state = state;
  this._emitter.emit("worker:state:" + state, this);
  if (state !== oldState) {
    this._options.logger('debug', this.toString(), ': state changed');
    this._emitter.emit("worker:state:changed", this, state, oldState);
    this._checkAvailabilityChanged();
  }
};

/**
 *
 * @private
 */
WorkerHandle.prototype._checkAvailabilityChanged = function() {
  var available = this.isAvailable();
  if (this._lastAvailability !== available) {
    this._emitter.emit("worker:availability:changed", this, available);
    this._lastAvailability = available;
  }
};

/**
 *
 * @private
 */
WorkerHandle.prototype._touch = function() {
  if (this._options.inactivityTimeout && this._options.inactivityTimeout !== Infinity) {
    clearTimeout(this._inactivityTimer);
    this._inactivityTimer = setTimeout(function() {
      this._emitter.emit("worker:inactivity-timeout", this);
      this.kill(false, true);
    }.bind(this), this._options.inactivityTimeout);
  }
};

/**
 *
 * @returns {null|*}
 */
WorkerHandle.prototype.exitCode = function() {
  return this._exitCode;
};

/**
 *
 * @private
 */
WorkerHandle.prototype._resetProcess = function() {
  this._exitCode = null;
  this._callsProcessed = 0;
  this._pipe.resetPending();
};

/**
 * Fork a child process and associate with this handle instance
 */
WorkerHandle.prototype.fork = function() {
  // Reset previous process info
  this._resetProcess();
  this._touch();
  this._setState(State.forking);

  // Fork the process
  this._child = childProcess.fork(workerWrapperPath, {
    env: process.env,
    cwd: process.cwd()
  });

  this._emitter.emit('worker:pid:created', this.pid());

  this._configureComm();
  return this._initWorker();
};

/**
 *
 * @private
 */
WorkerHandle.prototype._configureComm = function() {
  // Configure outgoing messages
  this._pipe.sender(function(message) {
    this._child.send(message);
  }.bind(this));

  // Configure incoming messages
  this._child.on('message', this._pipe.receiver());

  // Configure child death
  this._child.on('exit', this._exited.bind(this));
};

/**
 *
 * @returns {*}
 * @private
 */
WorkerHandle.prototype._initWorker = function() {
  return this._send('init', { moduleName: this._options.workerModulePath }).then(function() {
    this._setState(State.processing);
  }.bind(this), function(err) {
    this._options.logger("error", "Error initializing worker", err);
    this._setState(State.destroying);
  }.bind(this));
};

/**
 *
 * @param callback
 */
WorkerHandle.prototype.discoverInterface = function() {
  return this._send('iface');
};

/**
 *
 * @param code
 * @private
 */
WorkerHandle.prototype._exited = function(code) {
  this._exitCode = code;
  if (this._killDeferral) {
    this._killDeferral.resolve(code);
    this._killDeferral = null;
  }
  this._options.logger('debug', this.toString(), ': process exited');
  this._emitter.emit('worker:process:exited', this);
};

/**
 *
 * @param method
 * @param args
 * @param callback
 */
WorkerHandle.prototype.invoke = function(method, args) {
  args = args || [];
  if (!_.isArray(args)) {
    args = [ args ];
  }

  this._touch();

  return this._send('invoke', {
    method: method,
    args: args
  }).then(function(reply) {
    this._callsProcessed++;
    if (this.resetNeeded()) {
      this.reset();
    }
    this._checkAvailabilityChanged();

    return reply; // Propagate promise result
  }.bind(this));
};

/**
 *
 */
WorkerHandle.prototype.flush = function(emit) {
  if (emit !== false) {
    this._setState(State.flushing);
  }
  var promise = this._pipe.flush();
  promise.then(function() {
    if (emit !== false) {
      this._setState(State.processing);
    }
  }.bind(this))

  return promise;
};


/**
 *
 * @param op
 * @param payload
 * @private
 */
WorkerHandle.prototype._send = function(op, payload) {
  var message = {
    op: op,
    payload: payload || {}
  };
  this._options.logger('debug', this.toString(), ': Sending ', message);
  return this._pipe.send(message);
};

/**
 * @returns {boolean}
 */
WorkerHandle.prototype.resetNeeded = function() {
  return this._callsProcessed >= this._options.maxTotalCallsPerWorker;
};

/**
 *
 * @param hard {boolean}
 */
WorkerHandle.prototype.reset = function(hard) {
  this._options.logger('debug', this.toString(), ': reset');

  this._setState(State.flushing); // Manual event emission

  return this.flush(/* emit */false)
    .then(function() {
      return this.kill(hard);
    }.bind(this))
    .then(function() {
      this._pipe.clearPending(); // At his point only the 'bye' will be pending
      return this.fork();
    }.bind(this));
};

/**
 *
 * @returns {boolean}
 */
WorkerHandle.prototype.isIdle = function() {
  return this._pipe.pending() == 0;
};

/**
 *
 */
WorkerHandle.prototype.queuedCalls = function() {
  return this._pipe.queued();
};

/**
 *
 */
WorkerHandle.prototype.pendingCalls = function() {
  return this._pipe.pending();
};

/**
 *
 */
WorkerHandle.prototype.atCapacity = function() {
  return this._pipe.atCapacity();
};

/**
 *
 */
WorkerHandle.prototype.isAvailable = function() {
  return !this.atCapacity() && this._state === State.processing;
};

/**
 *
 */
WorkerHandle.prototype.kill = function(force, destroy) {
  this._setState(destroy ? State.destroying : State.dying);
  this._killDeferral = Q.defer();

  var doForceKill = function() {
    this._options.logger('debug', this.toString(), ': force killing');
    this._child.kill('SIGKILL');
  }.bind(this);

  if (force) {
    doForceKill();
  } else {
    this._options.logger('debug', this.toString(), ': gracefully killing');
    this._send('die');
    setTimeout(doForceKill, this._options.forceKillTimeout);
  }

  return this._killDeferral.promise;
};

/**
 *
 */
WorkerHandle.prototype.toJSON = function() {
  return {
    id: this.id(),
    pid: this.pid(),
    state: this.state(),
    available: this.available(),
    pendingCalls: this.pendingCalls(),
    queuedCalls: this.queuedCalls()
  };
};

/**
 *
 * @return {string}
 */
WorkerHandle.prototype.toString = function() {
  return "Worker[id=" + this.id() +
    ", pid=" + this.pid() +
    ", available=" + this.isAvailable() +
    ", state=" + this.state() +
    ", pendingCalls=" + this.pendingCalls() +
    ", queuedCalls=" + this.queuedCalls() +
    "]";
};

module.exports = WorkerHandle;
