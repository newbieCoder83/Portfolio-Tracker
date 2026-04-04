const express = require('express');
const router = express.Router();
const db = require('../db/connection');

/**
 * GET /api/history/dividends
 * Returns all dividends from SQLite, newest first.
 */
router.get('/dividends', (req, res) => {
  const dividends = db.prepare(
    'SELECT * FROM dividends ORDER BY paid_on DESC'
  ).all();
  res.json(dividends);
});

/**
 * GET /api/history/orders
 * Returns all historical orders from SQLite, newest first.
 */
router.get('/orders', (req, res) => {
  const orders = db.prepare(
    'SELECT * FROM orders ORDER BY order_created_at DESC'
  ).all();
  res.json(orders);
});

module.exports = router;
