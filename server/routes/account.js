const express = require('express');
const router = express.Router();
const db = require('../db/connection');

/**
 * GET /api/account/summary
 * Returns account summary from SQLite.
 */
router.get('/summary', (req, res) => {
  const summary = db.prepare('SELECT * FROM account_summary WHERE id = 1').get();
  if (!summary) {
    return res.json(null);
  }
  res.json(summary);
});

module.exports = router;
