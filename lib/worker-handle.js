
const _ = require('lodash');
const Q = require('q');
const childProcess = require('child_process');
const joi = require('joi');
const workerWrapperPath = require.resolve('./worker-wrapper');
const Pipe = require('./pipe');
const whipperUtil = require('./util');
const AtCapacityError = require('./error/at-capacity-error');

/**
 * WorkerHandle options schema
 */
const optionsSchema = joi.compile({

  /**
   * The resolved path to the worker module file.
   */
  workerModulePath: joi.string().required(),

  /**
   * The time duration in milliseconds since the last call processed after which a worker will be reclaimed.
   */
  inactivityTimeout: joi.number().integer().min(0).allow(Infinity).unit('ms'),

  /**
   * The time duration in milliseconds after which an initiated call to a worker will time-out
   * if a response is not received.
   */
  invocationTimeout: joi.number().integer().min(0).allow(Infinity).unit('ms'),

  /**
   * When a worker is flushing, it will temporarily stop accepting new calls, and await completion of any
   * queued or pending calls. If the flush takes longer than this time period in milliseconds
   * a graceful kill will be attempted.
   */
  flushTimeout: joi.number().integer().min(0).unit('ms'),

  /**
   * When a worker process is asked to die gracefully, if it has not completed its work and died after
   * this amount of time in milliseconds, a SIGKILL will be issued to kill it forcefully.
   */
  forceKillTimeout: joi.number().integer().min(0).unit('ms'),

  /**
   * The maximum number of concurrent calls a single worker will be allowed to process at a given time.
   */
  maxConcurrentCallsPerWorker: joi.number().integer().min(1).allow(Infinity),

  /**
   * The maximum number of calls total over time that a single worker can handle before the child process
   * is killed and forked anew. This is useful as a quick band-aid for memory leaks.
   */
  maxTotalCallsPerWorker: joi.number().integer().min(1).allow(Infinity),

  /**
   * The optional function that will receive logging messages.
   */
  logger: joi.func()

});

const optionDefaults = {
  inactivityTimeout: Infinity,
  invocationTimeout: 30000,
  flushTimeout: 5000,
  forceKillTimeout: 5000,
  maxConcurrentCallsPerWorker: Infinity,
  maxTotalCallsPerWorker: Infinity,
  logger: function() {}
};

/**
 *
 * @param id
 * @param emitter
 * @param options
 * @constructor
 */
function WorkerHandle(id, emitter, options) {

  options = whipperUtil.normalizeOptions(options, optionsSchema, optionDefaults);

  this._id = id;
  this._emitter = emitter;
  this._options = options;

  this._exitCode = null;
  this._exitSignal = null;
  this._callsReceived = 0;
  this._state = State.created;
  this._workingStatus = WorkingStatus.idle;

  this._stats = {
    maxSeenConcurrentCalls: 0
  };

  this._createPipe();
}

/**
 * State transition occurs generally in the order defined.
 */
const State = WorkerHandle.State = {

  /**
   * The worker handle has been created but a child process has not yet been forked.
   */
  created: "created",

  /**
   * A child process has been forked and is preparing to process work.
   */
  forking: "forking",

  /**
   * A child process exists and is available for processing work.
   */
  processing: "processing",

  /**
   * A child process exists and any pending or queued calls are awaiting completion before further calls are accepted.
   * If an invocation is attempted during the flushing state, it will be rejected with a thrown Error.
   */
  flushing: "flushing",

  /**
   * An existing child process is being killed either gracefully or forcefully with anticipation that a new
   * child process will be forked to continue processing work.
   */
  dying: "dying",

  /**
   * The worker handle is being destroyed, killing the child process, where the handle can no longer be used and must
   * be discarded.
   */
  destroying: "destroying"
};

/**
 * The status of the current workload being processed.
 */
const WorkingStatus = WorkerHandle.WorkingStatus = {

  /**
   * No calls are being processed and none are queued.
   */
  idle: "idle",

  /**
   * A call is being processed and any number of calls may be queued.
   */
  busy: "busy",

  /**
   * A
   */
  atCapacity: "atCapacity"
};

/**
 *
 * @private
 */
WorkerHandle.prototype._createPipe = function() {
  this._pipe = new Pipe({
    maxPending: this._options.maxConcurrentCallsPerWorker,
    pendingTimeout: this._options.invocationTimeout,
    logger: this._options.logger
  });
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
    if (this._options.logger) {
      this._options.logger('debug', this.toString(), ': state changed');
    }
    this._emitter.emit("worker:state:changed", this);
  }
};

/**
 *
 */
WorkerHandle.prototype.workingStatus = function() {
  return this._workingStatus;
};

/**
 *
 * @param workingStatus
 * @private
 */
WorkerHandle.prototype._setWorkingStatus = function(workingStatus) {
  var oldStatus = this._workingStatus;
  this._workingStatus = workingStatus;
  this._emitter.emit("worker:working-status:" + workingStatus, this);
  if (workingStatus !== oldStatus) {
    if (this._options.logger) {
      this._options.logger('debug', this.toString(), ': working status changed');
    }
    this._emitter.emit("worker:working-status:changed", this);
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
      if (this._options.logger) {
        this._options.logger('debug', this.toString(), ": inactivity timed out");
      }

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
 * @return {null|*}
 */
WorkerHandle.prototype.exitSignal = function() {
  return this._exitSignal;
};

/**
 *
 * @private
 */
WorkerHandle.prototype._resetProcess = function() {
  this._exitCode = null;
  this._callsReceived = 0;
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

  this._emitter.emit('worker:process:created', this);

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
  var def = Q.defer();
  this._send('init', { moduleName: this._options.workerModulePath }).then(function() {
    this._setState(State.processing);
    def.resolve(this);

  }.bind(this), function(err) {
    if (this._options.logger) {
      this._options.logger("error", "Error initializing worker", err);
    }
    this._setState(State.destroying);
    def.reject(err);
  }.bind(this));

  return def.promise;
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
WorkerHandle.prototype._exited = function(code, signal) {
  this._exitCode = code;
  this._exitSignal = signal;
  if (this._killDeferral) {
    this._killDeferral.resolve(this);
    this._killDeferral = null;
  }
  this._emitter.emit("worker:process:exited", this);
  if (this._options.logger) {
    this._options.logger('debug', this.toString(), ': process exited');
  }

};

/**
 *
 * @param method
 * @param args
 * @param callback
 */
WorkerHandle.prototype.invoke = function(method, args) {
  // Normalize args
  args = args || [];
  if (!_.isArray(args)) {
    args = [ args ];
  }

  this._touch();
  this._callsReceived++;

  var promise = this._send('invoke', {
    method: method,
    args: args
  }).then(function(reply) {
    this._handleInvokeReply();
    return reply; // Propagate promise result
  }.bind(this));

  this._setWorkingStatus(this.atCapacity() ? WorkingStatus.atCapacity : WorkingStatus.busy);

  return promise;
};

/**
 *
 * @param reply
 * @return {*}
 * @private
 */
WorkerHandle.prototype._handleInvokeReply = function() {
  if (this.resetNeeded()) {
    this.reset();
  }
  this._setWorkingStatus(this.isIdle() ? WorkingStatus.idle : WorkingStatus.busy);
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
  }.bind(this));

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
  if (this._options.logger) {
    this._options.logger('debug', this.toString(), ': Sending ', message);
  }
  return this._pipe.send(message);
};

/**
 * @returns {boolean}
 */
WorkerHandle.prototype.resetNeeded = function() {
  return this._callsReceived >= this._options.maxTotalCallsPerWorker;
};

/**
 *
 * @param hard {boolean}
 */
WorkerHandle.prototype.reset = function(hard) {
  if (this._options.logger) {
    this._options.logger('debug', this.toString(), ': reset');
  }

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
  return this.pendingCalls() === 0;
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
  return this._pipe.atMaxPending();
};

/**
 *
 */
WorkerHandle.prototype.kill = function(force, destroy) {
  this._setState(destroy ? State.destroying : State.dying);
  this._killDeferral = Q.defer();

  var doForceKill = function() {
    if (this._options.logger) {
      this._options.logger('debug', this.toString(), ': force killing');
    }
    this._child.kill('SIGKILL');
  }.bind(this);

  if (force) {
    doForceKill();
  } else {
    if (this._options.logger) {
      this._options.logger('debug', this.toString(), ': gracefully killing');
    }
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
    workingStatus: this.workingStatus(),
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
    ", workingStatus=" + this.workingStatus() +
    ", state=" + this.state() +
    ", pendingCalls=" + this.pendingCalls() +
    ", queuedCalls=" + this.queuedCalls() +
    "]";
};

module.exports = WorkerHandle;
