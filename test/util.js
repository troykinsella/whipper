
var testWorker = require('./fixtures/test-worker');

function getTestWorkerInterface() {
  var iface = [];
  Object.keys(testWorker).forEach(function(name) {
    var val = testWorker[name];
    if (typeof val === 'function') {
      iface.push(name);
    }
  });
  return iface;
}

function forceKill(pid) {
  try {
    process.kill(pid);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  forceKill: forceKill,
  getTestWorkerInterface: getTestWorkerInterface
};
