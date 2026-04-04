const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { decrypt } = require('../services/crypto');
const { incrementalSync, getSyncState } = require('../services/syncService');

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

    const counts = await incrementalSync(apiKey, apiSecret, user.environment);
    const lastSync = getSyncState('last_sync');

    res.json({ success: true, counts, lastSync });
  } catch (err) {
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
