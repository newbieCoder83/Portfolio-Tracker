const express = require('express');
const router = express.Router();
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const cache = require('../services/cache');
const db = require('../db/connection');
const { normaliseToYahoo } = require('../utils/tickerUtils');

let lastGoodResult = null; // stale fallback, survives cache expiry

router.get('/', async (req, res) => {
  try {
    // 1. Return from cache if still fresh
    const cached = cache.get('heatmap');
    if (cached) return res.json(cached);

    // 2. Load positions from DB (skip zero-value positions)
    const positions = db.prepare(
      `SELECT ticker, instrument_name, current_price, wallet_current_value
       FROM positions
       WHERE wallet_current_value > 0
       ORDER BY wallet_current_value DESC`
    ).all();

    if (!positions.length) {
      return res.json({ stale: false, sectors: [] });
    }

    // 3. Enrich each position with Yahoo Finance data.
    //    Each ticker is wrapped in its own try/catch so a single failure
    //    never prevents the rest of the heatmap from rendering.
    const enriched = await Promise.all(positions.map(async (pos) => {
      try {
        const yahooTicker = normaliseToYahoo(pos.ticker);
        console.log(`[Heatmap] ${pos.ticker} -> ${yahooTicker}`);
        const quote = await yahooFinance.quoteSummary(yahooTicker, {
          modules: ['price', 'assetProfile'],
        });
        const price = quote.price || {};
        const profile = quote.assetProfile || {};

        const currentPrice = price.regularMarketPrice ?? pos.current_price ?? 0;
        const prevClose = price.regularMarketPreviousClose ?? currentPrice;
        const pctChange = prevClose > 0
          ? ((currentPrice - prevClose) / prevClose) * 100
          : 0;

        return {
          ticker: pos.ticker, // always the original T212 ticker
          name: price.shortName || price.longName || pos.instrument_name || pos.ticker,
          sector: profile.sector || 'Other',
          industry: profile.industry || 'Unknown',
          currentPrice,
          pctChange,
          marketValue: pos.wallet_current_value,
          failed: false,
        };
      } catch (err) {
        console.warn(`[Heatmap] Failed to fetch ${pos.ticker}:`, err.message);

        // Fallback: try Yahoo search using the instrument name from DB
        try {
          const searchName = pos.instrument_name || pos.ticker;
          const searchResults = await yahooFinance.search(searchName, {
            newsCount: 0,
            quotesCount: 1,
          });
          if (searchResults?.quotes?.length > 0) {
            const match = searchResults.quotes[0];
            const quote = await yahooFinance.quoteSummary(match.symbol, {
              modules: ['price', 'assetProfile'],
            });
            const price = quote.price || {};
            const profile = quote.assetProfile || {};
            const currentPrice = price.regularMarketPrice ?? pos.current_price ?? 0;
            const prevClose = price.regularMarketPreviousClose ?? currentPrice;
            const pctChange = prevClose > 0
              ? ((currentPrice - prevClose) / prevClose) * 100
              : 0;
            console.log(`[Heatmap] Fallback search matched ${pos.ticker} -> ${match.symbol}`);
            return {
              ticker: pos.ticker,
              name: price.shortName || price.longName || pos.instrument_name || pos.ticker,
              sector: profile.sector || 'Other',
              industry: profile.industry || 'Unknown',
              currentPrice,
              pctChange,
              marketValue: pos.wallet_current_value,
              failed: false,
            };
          }
        } catch (searchErr) {
          console.warn(`[Heatmap] Fallback search also failed for ${pos.ticker}:`, searchErr.message);
        }

        // Both direct fetch and search failed, so return a neutral placeholder.
        return {
          ticker: pos.ticker,
          name: pos.instrument_name || pos.ticker,
          sector: 'Other',
          industry: 'Other',
          currentPrice: pos.current_price || 0,
          pctChange: 0,
          marketValue: pos.wallet_current_value,
          failed: true,
        };
      }
    }));

    // 4. Group by sector -> industry, sorted by total value descending
    const sectorMap = {};
    for (const stock of enriched) {
      const industryName = stock.industry === 'Unknown' ? stock.sector : stock.industry;

      if (!sectorMap[stock.sector]) {
        sectorMap[stock.sector] = { name: stock.sector, totalValue: 0, industries: {} };
      }
      const sector = sectorMap[stock.sector];
      sector.totalValue += stock.marketValue;

      if (!sector.industries[industryName]) {
        sector.industries[industryName] = { name: industryName, totalValue: 0, stocks: [] };
      }
      sector.industries[industryName].totalValue += stock.marketValue;
      sector.industries[industryName].stocks.push(stock);
    }

    const sectors = Object.values(sectorMap)
      .sort((a, b) => b.totalValue - a.totalValue)
      .map((sector) => ({
        name: sector.name,
        totalValue: sector.totalValue,
        industries: Object.values(sector.industries)
          .sort((a, b) => b.totalValue - a.totalValue)
          .map((ind) => ({
            ...ind,
            stocks: ind.stocks.sort((a, b) => b.marketValue - a.marketValue),
          })),
      }));

    const result = { stale: false, sectors };
    cache.set('heatmap', result, 100_000); // 100-second TTL
    lastGoodResult = result;
    return res.json(result);
  } catch (err) {
    // Outer error (e.g. 429 rate limit, network failure): serve stale data if available.
    console.error('[Heatmap] Outer error:', err.message);
    if (lastGoodResult) {
      return res.json({ ...lastGoodResult, stale: true });
    }
    return res.status(503).json({ error: 'Heatmap unavailable', stale: true, sectors: [] });
  }
});

module.exports = router;
