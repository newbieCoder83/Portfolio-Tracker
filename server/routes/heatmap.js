const express = require('express');
const router = express.Router();
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const cache = require('../services/cache');
const db = require('../db/connection');

// Convert T212 ticker format to Yahoo Finance format.
// Always use the original T212 ticker in responses — only use the converted
// ticker when calling yahooFinance.quoteSummary().
function normaliseToYahoo(t212Ticker) {
  // Remove trailing _EQ or _US_EQ first
  let ticker = t212Ticker
    .replace(/_US_EQ$/, '')
    .replace(/_EQ$/, '');

  // T212 uses lowercase 'l' at end of ticker to denote LSE listing
  // e.g. BGEOl → BGEO.L, VMIDl → VMID.L
  if (ticker.endsWith('l') && ticker === ticker.toUpperCase().slice(0,-1) + 'l') {
    return ticker.slice(0, -1) + '.L';
  }

  // Named exchange suffixes (uppercase tickers with exchange code)
  const suffixMap = {
    '_LON': '.L',
    '_EAM': '.AS',
    '_EPA': '.PA',
    '_ETR': '.DE',
    '_BME': '.MC',
    '_BIT': '.MI',
    '_HEL': '.HE',
    '_WSE': '.WA',
    '_ATH': '.AT',
    '_OMX': '.ST',
    '_CPH': '.CO',
    '_OSL': '.OL',
    '_ISE': '.IR',
    '_TSX': '.TO',
    '_ASX': '.AX',
    '_SGX': '.SI',
    '_HKE': '.HK',
  };

  for (const [t212Suffix, yahooSuffix] of Object.entries(suffixMap)) {
    if (t212Ticker.includes(t212Suffix)) {
      return t212Ticker.split(t212Suffix)[0] + yahooSuffix;
    }
  }

  return ticker; // US and others
}

let lastGoodResult = null; // stale fallback — survives cache expiry

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
        console.log(`[Heatmap] ${pos.ticker} → ${yahooTicker}`);
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
            console.log(`[Heatmap] Fallback search matched ${pos.ticker} → ${match.symbol}`);
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

        // Both direct fetch and search failed — return neutral placeholder
        return {
          ticker: pos.ticker,
          name: pos.instrument_name || pos.ticker,
          sector: 'Other',
          industry: 'Unknown',
          currentPrice: pos.current_price || 0,
          pctChange: 0,
          marketValue: pos.wallet_current_value,
          failed: true,
        };
      }
    }));

    // 4. Group by sector, sorted by total value descending
    const sectorMap = {};
    for (const stock of enriched) {
      if (!sectorMap[stock.sector]) {
        sectorMap[stock.sector] = { name: stock.sector, totalValue: 0, stocks: [] };
      }
      sectorMap[stock.sector].totalValue += stock.marketValue;
      sectorMap[stock.sector].stocks.push(stock);
    }
    const sectors = Object.values(sectorMap)
      .sort((a, b) => b.totalValue - a.totalValue);

    const result = { stale: false, sectors };
    cache.set('heatmap', result, 100_000); // 100-second TTL
    lastGoodResult = result;
    return res.json(result);

  } catch (err) {
    // Outer error (e.g. 429 rate limit, network failure) — serve stale data if available
    console.error('[Heatmap] Outer error:', err.message);
    if (lastGoodResult) {
      return res.json({ ...lastGoodResult, stale: true });
    }
    return res.status(503).json({ error: 'Heatmap unavailable', stale: true, sectors: [] });
  }
});

module.exports = router;
