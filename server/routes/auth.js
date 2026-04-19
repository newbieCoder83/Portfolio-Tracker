const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { encrypt, decrypt } = require('../services/crypto');
const T212Client = require('../services/t212Client');
const { fullSync, getSyncState } = require('../services/syncService');

/**
 * POST /api/auth/login
 * Validates T212 credentials, encrypts and stores them, triggers full sync.
 */
router.post('/login', async (req, res) => {
  try {
    const { apiKey, apiSecret, environment } = req.body;

    if (!apiKey || !apiSecret || !environment) {
      return res.status(400).json({ error: 'apiKey, apiSecret, and environment are required' });
    }

    if (!['live', 'demo'].includes(environment)) {
      return res.status(400).json({ error: 'environment must be "live" or "demo"' });
    }

    // Validate credentials by calling the account summary endpoint
    const client = new T212Client(apiKey, apiSecret, environment);
    let summary;
    try {
      summary = await client.get('/api/v0/equity/account/summary', 'summary', false);
    } catch (err) {
      if (err.response && (err.response.status === 401 || err.response.status === 403)) {
        return res.status(401).json({ error: 'Invalid API credentials' });
      }
      throw err;
    }

    // Encrypt credentials
    const keyEnc = encrypt(apiKey);
    const secretEnc = encrypt(apiSecret);

    // Upsert user (only one user supported — always id=1)
    const existing = db.prepare('SELECT id FROM users WHERE id = 1').get();
    if (existing) {
      db.prepare(`
        UPDATE users SET
          api_key_enc = ?, api_secret_enc = ?,
          iv_key = ?, iv_secret = ?,
          auth_tag_key = ?, auth_tag_secret = ?,
          environment = ?, created_at = datetime('now')
        WHERE id = 1
      `).run(
        keyEnc.encrypted, secretEnc.encrypted,
        keyEnc.iv, secretEnc.iv,
        keyEnc.authTag, secretEnc.authTag,
        environment
      );
    } else {
      db.prepare(`
        INSERT INTO users (id, api_key_enc, api_secret_enc, iv_key, iv_secret, auth_tag_key, auth_tag_secret, environment)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        keyEnc.encrypted, secretEnc.encrypted,
        keyEnc.iv, secretEnc.iv,
        keyEnc.authTag, secretEnc.authTag,
        environment
      );
    }

    // Set session
    req.session.userId = 1;
    req.session.environment = environment;

    // Trigger full sync in background (don't block login response)
    res.json({
      success: true,
      environment,
      accountId: summary.id,
      currency: summary.currency,
      syncing: true,
    });

    // Full sync after response
    try {
      await fullSync(apiKey, apiSecret, environment);
      console.log('[Auth] Full sync completed after login');
    } catch (syncErr) {
      console.error('[Auth] Full sync failed after login:', syncErr.message);
    }
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ error: 'Login failed: ' + err.message });
  }
});

/**
 * GET /api/auth/status
 * Check if user is authenticated. Auto-restores from saved creds if possible.
 */
router.get('/status', async (req, res) => {
  // Check active session
  if (req.session && req.session.userId) {
    const lastSync = getSyncState('last_sync');
    return res.json({
      authenticated: true,
      environment: req.session.environment,
      lastSync,
    });
  }

  // Try to restore from saved credentials
  const user = db.prepare('SELECT * FROM users WHERE id = 1').get();
  if (!user) {
    return res.json({ authenticated: false });
  }

  try {
    // Decrypt to verify the key is still valid (no live API call)
    decrypt(user.api_key_enc, user.iv_key, user.auth_tag_key);

    // Restore session from saved creds directly — skip live T212 validation
    // to avoid rate-limit storms on repeated auth checks
    req.session.userId = 1;
    req.session.environment = user.environment;

    const lastSync = getSyncState('last_sync');
    return res.json({
      authenticated: true,
      environment: user.environment,
      lastSync,
      restored: true,
    });
  } catch (err) {
    console.log('[Auth] Could not restore session:', err.message);
    return res.json({ authenticated: false });
  }
});

/**
 * DELETE /api/auth/logout
 * Destroys session but keeps saved credentials for future auto-login.
 */
router.delete('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

module.exports = router;
