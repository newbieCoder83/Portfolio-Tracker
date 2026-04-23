const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { decrypt } = require('../services/crypto');
const { incrementalSync, getSyncState } = require('../services/syncService');
const { getSyncStatus, runTrackedSync, SyncInProgressError } = require('../services/syncStatus');

function buildSyncStatusResponse() {
  const status = getSyncStatus();
  return {
    syncing: status.syncing,
    syncType: status.type,
    syncStartedAt: status.startedAt,
    lastSync: getSyncState('last_sync'),
  };
}

/**
 * GET /api/sync/status
 * Returns whether a full or incremental sync is currently running.
 */
router.get('/status', (req, res) => {
  res.json(buildSyncStatusResponse());
});

/**
 * POST /api/sync
 * Triggers an incremental sync with T212 API.
 */
router.post('/', async (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = 1').get();
    if (!user) {
      return res.status(400).json({ error: 'No saved credentials' });
    }

    const apiKey = decrypt(user.api_key_enc, user.iv_key, user.auth_tag_key);
    const apiSecret = decrypt(user.api_secret_enc, user.iv_secret, user.auth_tag_secret);

    const counts = await runTrackedSync(
      'incremental',
      () => incrementalSync(apiKey, apiSecret, user.environment)
    );
    const lastSync = getSyncState('last_sync');

    res.json({ success: true, counts, lastSync });
  } catch (err) {
    if (err instanceof SyncInProgressError) {
      return res.status(409).json({
        error: err.message,
        ...buildSyncStatusResponse(),
      });
    }

    console.error('[Sync] Error:', err.message);
    res.status(500).json({ error: 'Sync failed: ' + err.message });
  }
});

/**
 * GET /api/snapshots
 * Returns all daily portfolio snapshots for charts.
 */
router.get('/snapshots', (req, res) => {
  const snapshots = db.prepare(
    'SELECT * FROM snapshots ORDER BY date ASC'
  ).all();
  res.json(snapshots);
});

module.exports = router;
