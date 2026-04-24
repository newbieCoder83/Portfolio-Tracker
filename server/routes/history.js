const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { buildTotalReturnHistory } = require('../services/totalReturnService');
const { refreshSplitsForTickers } = require('../services/corporateActionsService');
const { refreshHistoricalPricesForTickers } = require('../services/historicalPriceService');

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

/**
 * GET /api/history/total-return
 * Returns an estimated daily total-return history from cached T212 history.
 */
router.get('/total-return', async (req, res) => {
  try {
    const history = await buildTotalReturnHistory();
    res.json(history);
  } catch (err) {
    console.error('[History] Failed to build total return history:', err);
    res.status(500).json({ error: 'Failed to build total return history' });
  }
});

/**
 * GET /api/history/total-return-raw
 * Same reconstruction, but skips the 2% reconciliation blocker, the final-point
 * T212 summary anchor, and related validation blockers. It still uses imported
 * Trading 212 export rows when they are available.
 */
router.get('/total-return-raw', async (req, res) => {
  try {
    const history = await buildTotalReturnHistory({ skipReconciliation: true });
    res.json(history);
  } catch (err) {
    console.error('[History] Failed to build raw total return history:', err);
    res.status(500).json({ error: 'Failed to build raw total return history' });
  }
});

/**
 * POST /api/corporate-actions/refresh
 * Manually re-fetches stock-split data from TwelveData for every ticker the
 * user holds or has ever traded. Cached in `corporate_actions` and merged
 * into the reconstruction's splitsByDate alongside Yahoo's split events.
 *
 * By default skips any ticker fetched in the last 30 days (cache hit) — splits
 * are rare events, so once cached, re-fetching is wasteful of the free 800/day
 * TwelveData budget. Pass `?force=true` to bypass the cache and re-fetch all.
 *
 * Mounted at /api/history/corporate-actions/refresh because this router is
 * mounted under /api/history.
 */
router.post('/corporate-actions/refresh', async (req, res) => {
  if (!process.env.TWELVEDATA_API_KEY) {
    return res.status(503).json({ error: 'TWELVEDATA_API_KEY is not set' });
  }

  const force = req.query.force === 'true' || req.query.force === '1';
  const maxAgeDays = force ? 0 : 30;

  try {
    const tickerRows = db.prepare(`
      SELECT DISTINCT ticker FROM (
        SELECT ticker FROM positions WHERE ticker IS NOT NULL
        UNION
        SELECT ticker FROM orders WHERE ticker IS NOT NULL
      )
    `).all();
    const tickers = tickerRows.map((row) => row.ticker);

    const result = await refreshSplitsForTickers(tickers, { maxAgeDays });
    res.json({ ...result, force, maxAgeDays });
  } catch (err) {
    console.error('[CorporateActions] Refresh failed:', err);
    res.status(500).json({ error: 'Failed to refresh corporate actions' });
  }
});

/**
 * POST /api/history/historical-prices/refresh
 * Opportunistically asks TwelveData for historical daily prices for the
 * symbols currently using fill-price fallback. Delisted symbols may not be
 * available on the Basic plan, so manual CSV import remains the reliable path.
 */
router.post('/historical-prices/refresh', async (req, res) => {
  if (!process.env.TWELVEDATA_API_KEY) {
    return res.status(503).json({ error: 'TWELVEDATA_API_KEY is not set' });
  }

  const force = req.query.force === 'true' || req.query.force === '1';
  const maxAgeDays = force ? 0 : 30;
  const tickers = Array.isArray(req.body?.tickers)
    ? req.body.tickers.filter(Boolean)
    : [];

  if (tickers.length === 0) {
    return res.status(400).json({ error: 'No tickers supplied for historical price refresh' });
  }

  try {
    const result = await refreshHistoricalPricesForTickers(tickers, { maxAgeDays });
    res.json({ ...result, force, maxAgeDays });
  } catch (err) {
    console.error('[HistoricalPrices] Refresh failed:', err);
    res.status(500).json({ error: 'Failed to refresh historical prices' });
  }
});

module.exports = router;
