const express = require('express');
const router = express.Router();
const db = require('../db/connection');

/**
 * GET /api/portfolio/positions
 * Returns all positions from SQLite with dividend income per ticker.
 */
router.get('/positions', (req, res) => {
  const positions = db.prepare(`
    SELECT p.*,
      COALESCE(d.total_dividends, 0) as dividend_income,
      COALESCE(d.dividend_count, 0) as dividend_count
    FROM positions p
    LEFT JOIN (
      SELECT ticker, SUM(amount) as total_dividends, COUNT(*) as dividend_count
      FROM dividends
      GROUP BY ticker
    ) d ON p.ticker = d.ticker
    ORDER BY p.wallet_current_value DESC
  `).all();

  res.json(positions);
});

module.exports = router;
