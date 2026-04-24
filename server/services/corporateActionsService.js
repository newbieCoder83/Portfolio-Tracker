const db = require('../db/connection');
const { normaliseToYahoo } = require('../utils/tickerUtils');

const TWELVEDATA_BASE_URL = 'https://api.twelvedata.com';
const RATE_LIMIT_DELAY_MS = 200;

const YAHOO_TO_TWELVEDATA_EXCHANGE = {
  '.L': 'LSE',
  '.DE': 'XETR',
  '.PA': 'EURONEXT',
  '.AS': 'EURONEXT',
  '.MI': 'MIL',
  '.MC': 'BME',
  '.HE': 'HEL',
  '.ST': 'OMX',
  '.CO': 'CPH',
  '.OL': 'OSL',
  '.IR': 'ISE',
  '.TO': 'TSX',
  '.AX': 'ASX',
  '.SI': 'SGX',
  '.HK': 'HKEX',
};

function t212ToTwelveDataSymbol(t212Ticker) {
  const yahooSymbol = normaliseToYahoo(t212Ticker);
  if (!yahooSymbol) {
    return null;
  }

  for (const [suffix, exchange] of Object.entries(YAHOO_TO_TWELVEDATA_EXCHANGE)) {
    if (yahooSymbol.endsWith(suffix)) {
      const base = yahooSymbol.slice(0, -suffix.length);
      return `${base}:${exchange}`;
    }
  }

  return yahooSymbol;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSplitsFromTwelveData(t212Ticker, apiKey) {
  const symbol = t212ToTwelveDataSymbol(t212Ticker);
  if (!symbol) {
    return { ok: false, reason: 'no_symbol_mapping', splits: [] };
  }

  const url = `${TWELVEDATA_BASE_URL}/splits?symbol=${encodeURIComponent(symbol)}&range=full&apikey=${encodeURIComponent(apiKey)}`;

  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    return { ok: false, reason: `network: ${err.message}`, splits: [] };
  }

  if (!response.ok) {
    return { ok: false, reason: `http ${response.status}`, splits: [] };
  }

  const body = await response.json();

  if (body?.status === 'error') {
    return { ok: false, reason: body.message || 'twelvedata error', splits: [] };
  }

  const splits = Array.isArray(body?.splits) ? body.splits : Array.isArray(body) ? body : [];
  const parsed = splits
    .map((row) => {
      const date = row?.date ? String(row.date).slice(0, 10) : null;
      const fromFactor = Number(row?.from_factor);
      const toFactor = Number(row?.to_factor);
      if (!date || !Number.isFinite(fromFactor) || !Number.isFinite(toFactor) || fromFactor === 0) {
        return null;
      }
      return { date, factor: toFactor / fromFactor };
    })
    .filter(Boolean);

  return { ok: true, symbol, splits: parsed };
}

function upsertSplits(t212Ticker, splits, source) {
  const stmt = db.prepare(`
    INSERT INTO corporate_actions (ticker, action_date, action_type, factor, source, fetched_at)
    VALUES (?, ?, 'SPLIT', ?, ?, datetime('now'))
    ON CONFLICT(ticker, action_date, source) DO UPDATE SET
      factor = excluded.factor,
      fetched_at = datetime('now')
  `);

  const txn = db.transaction((rows) => {
    for (const row of rows) {
      stmt.run(t212Ticker, row.date, row.factor, source);
    }
  });

  txn(splits);
}

function markFetchedEvenIfEmpty(t212Ticker, source) {
  // Stash a sentinel zero-factor row ONLY if we have nothing else, so that
  // subsequent maxAgeDays checks see a recent fetched_at. We use a real
  // sentinel date in the future to avoid colliding with real splits.
  // A simpler approach: keep a small `corporate_actions_fetch_log` table.
  // For now, write a sync_state key.
  db.prepare(`
    INSERT INTO sync_state (key, value)
    VALUES (?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = datetime('now')
  `).run(`corporate_actions_fetched:${source}:${t212Ticker}`);
}

function getLastFetchedAt(t212Ticker, source) {
  const row = db.prepare(`
    SELECT value FROM sync_state WHERE key = ?
  `).get(`corporate_actions_fetched:${source}:${t212Ticker}`);
  return row ? row.value : null;
}

function isFetchFresh(lastFetchedAt, maxAgeDays) {
  if (!lastFetchedAt) return false;
  const ageMs = Date.now() - new Date(lastFetchedAt + 'Z').getTime();
  return Number.isFinite(ageMs) && ageMs < maxAgeDays * 86400000;
}

async function refreshSplitsForTickers(tickers, { maxAgeDays = 7 } = {}) {
  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: 'TWELVEDATA_API_KEY not set', fetched: 0, cached: 0, failed: 0, durationMs: 0 };
  }

  const start = Date.now();
  const unique = [...new Set(tickers.filter(Boolean))];
  let fetched = 0;
  let cached = 0;
  let failed = 0;
  const failures = [];

  for (const ticker of unique) {
    const lastFetchedAt = getLastFetchedAt(ticker, 'twelvedata');
    if (isFetchFresh(lastFetchedAt, maxAgeDays)) {
      cached += 1;
      continue;
    }

    const result = await fetchSplitsFromTwelveData(ticker, apiKey);
    if (result.ok) {
      if (result.splits.length > 0) {
        upsertSplits(ticker, result.splits, 'twelvedata');
      }
      markFetchedEvenIfEmpty(ticker, 'twelvedata');
      fetched += 1;
    } else {
      failed += 1;
      failures.push({ ticker, reason: result.reason });
    }

    await sleep(RATE_LIMIT_DELAY_MS);
  }

  return {
    ok: true,
    fetched,
    cached,
    failed,
    failures,
    durationMs: Date.now() - start,
  };
}

function getMergedSplitsByDate(t212Ticker) {
  const rows = db.prepare(`
    SELECT action_date, factor, source FROM corporate_actions
    WHERE ticker = ? AND action_type = 'SPLIT'
    ORDER BY action_date ASC
  `).all(t212Ticker);

  const sourcePriority = { manual: 3, twelvedata: 2, yahoo: 1 };
  const byDate = new Map();

  for (const row of rows) {
    if (!Number.isFinite(row.factor) || row.factor === 0 || row.factor === 1) {
      continue;
    }
    const existing = byDate.get(row.action_date);
    const incomingPriority = sourcePriority[row.source] ?? 0;
    const existingPriority = existing ? sourcePriority[existing.source] ?? 0 : -1;
    if (incomingPriority > existingPriority) {
      byDate.set(row.action_date, { factor: row.factor, source: row.source });
    }
  }

  const result = new Map();
  for (const [date, { factor }] of byDate.entries()) {
    result.set(date, factor);
  }
  return result;
}

function getManualSplitOverridesByDate(t212Ticker) {
  const rows = db.prepare(`
    SELECT action_date, factor FROM corporate_actions
    WHERE ticker = ? AND action_type = 'SPLIT' AND source = 'manual'
    ORDER BY action_date ASC
  `).all(t212Ticker);

  const result = new Map();
  for (const row of rows) {
    const factor = Number(row.factor);
    if (!Number.isFinite(factor) || factor <= 0 || factor === 1) {
      continue;
    }
    result.set(row.action_date, factor);
  }

  return result;
}

module.exports = {
  refreshSplitsForTickers,
  getMergedSplitsByDate,
  getManualSplitOverridesByDate,
  t212ToTwelveDataSymbol,
};
