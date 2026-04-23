const syncStatus = {
  syncing: false,
  type: null,
  startedAt: null,
};

class SyncInProgressError extends Error {
  constructor(currentSync) {
    super(`A ${currentSync.type || 'sync'} is already in progress`);
    this.name = 'SyncInProgressError';
    this.currentSync = currentSync;
  }
}

function getSyncStatus() {
  return { ...syncStatus };
}

async function runTrackedSync(type, task) {
  const currentSync = getSyncStatus();
  if (currentSync.syncing) {
    throw new SyncInProgressError(currentSync);
  }

  syncStatus.syncing = true;
  syncStatus.type = type;
  syncStatus.startedAt = new Date().toISOString();

  try {
    return await task();
  } finally {
    syncStatus.syncing = false;
    syncStatus.type = null;
    syncStatus.startedAt = null;
  }
}

module.exports = {
  getSyncStatus,
  runTrackedSync,
  SyncInProgressError,
};
