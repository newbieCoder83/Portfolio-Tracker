const db = require('../db/connection');
const { t212ToTwelveDataSymbol } = require('./corporateActionsService');

const TWELVEDATA_BASE_URL = 'https://api.twelvedata.com';
const RATE_LIMIT_DELAY_MS = 200;
const FETCH_SOURCE = 'twelvedata';
const SOURCE_PRIORITY = { manual: 3, twelvedata: 2, yahoo: 1 };

const TRADE_ACTIONS = [
  'Market buy',
  'Limit buy',
  'Market sell',
  'Limit sell',
  'Stock distribution',
  'Stock split open',
  'Stock split close',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDateKey(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function getInstrumentKeyFromParts(isin, ticker) {
  if (isin) {
    return `isin:${isin}`;
  }

  return ticker ? `ticker:${ticker}` : null;
}

function normalisePriceCurrency(currency) {
  if (!currency) {
    return { currency: null, scale: 1 };
  }

  const text = String(currency).trim();
  if (text === 'GBp') {
    return { currency: 'GBP', scale: 0.01 };
  }

  const upper = text.toUpperCase();
  if (upper === 'GBX' || upper === 'GBPENCE' || upper === 'GBP.P') {
    return { currency: 'GBP', scale: 0.01 };
  }

  return { currency: upper, scale: 1 };
}

function buildTickerAliases(ticker) {
  const aliases = new Set();
  const raw = String(ticker || '').trim();

  if (!raw) {
    return [];
  }

  aliases.add(raw);

  let stripped = raw
    .replace(/_US_EQ$/, '')
    .replace(/_EQ$/, '');
  aliases.add(stripped);

  if (stripped.endsWith('l') && stripped === stripped.toUpperCase().slice(0, -1) + 'l') {
    aliases.add(stripped.slice(0, -1));
  }

  if (stripped.endsWith('.L')) {
    aliases.add(stripped.slice(0, -2));
  }

  return [...aliases].filter(Boolean);
}

function getLastFetchedAt(instrumentKey, source) {
  const row = db.prepare('SELECT value FROM sync_state WHERE key = ?').get(
    `historical_prices_fetched:${source}:${instrumentKey}`
  );
  return row ? row.value : null;
}

function markFetched(instrumentKey, source) {
  db.prepare(`
    INSERT INTO sync_state (key, value)
    VALUES (?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = datetime('now')
  `).run(`historical_prices_fetched:${source}:${instrumentKey}`);
}

function isFetchFresh(lastFetchedAt, maxAgeDays) {
  if (!lastFetchedAt) {
    return false;
  }

  const ageMs = Date.now() - new Date(`${lastFetchedAt}Z`).getTime();
  return Number.isFinite(ageMs) && ageMs < maxAgeDays * 86400000;
}

function queryByValues(sqlPrefix, values) {
  if (values.length === 0) {
    return [];
  }

  const placeholders = values.map(() => '?').join(', ');
  return db.prepare(`${sqlPrefix} (${placeholders})`).all(...values);
}

function resolveRefreshTarget(ticker) {
  const aliases = buildTickerAliases(ticker);
  const orders = queryByValues(`
    SELECT ticker, instrument_isin, instrument_name, instrument_currency,
           COALESCE(fill_filled_at, order_created_at) AS date_time
    FROM orders
    WHERE status = 'FILLED' AND ticker IN
  `, aliases);
  const isins = [...new Set(orders.map((order) => order.instrument_isin).filter(Boolean))];

  let exportRows = [];
  if (isins.length > 0) {
    exportRows = queryByValues(`
      SELECT action, ticker, isin, name, price_currency, date_time
      FROM t212_export_rows
      WHERE isin IN
    `, isins);
  } else {
    exportRows = queryByValues(`
      SELECT action, ticker, isin, name, price_currency, date_time
      FROM t212_export_rows
      WHERE ticker IN
    `, aliases);
  }

  const tradeRows = exportRows.filter((row) => TRADE_ACTIONS.includes(row.action));
  const dates = [
    ...orders.map((order) => toDateKey(order.date_time)),
    ...tradeRows.map((row) => toDateKey(row.date_time)),
  ].filter(Boolean).sort();

  const isin = isins[0] || exportRows.find((row) => row.isin)?.isin || null;
  const rawTicker = exportRows.find((row) => row.ticker)?.ticker || aliases[1] || ticker;
  const instrumentKey = getInstrumentKeyFromParts(isin, ticker);

  if (!instrumentKey || dates.length === 0) {
    return null;
  }

  return {
    inputTicker: ticker,
    instrumentKey,
    ticker,
    isin,
    rawTicker,
    name: exportRows.find((row) => row.name)?.name
      || orders.find((order) => order.instrument_name)?.instrument_name
      || ticker,
    priceCurrency: exportRows.find((row) => row.price_currency)?.price_currency
      || orders.find((order) => order.instrument_currency)?.instrument_currency
      || null,
    sourceSymbol: t212ToTwelveDataSymbol(ticker) || rawTicker,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
  };
}

async function fetchTimeSeriesFromTwelveData(target, apiKey) {
  if (!target.sourceSymbol) {
    return { ok: false, reason: 'no_symbol_mapping', bars: [] };
  }

  const url = new URL(`${TWELVEDATA_BASE_URL}/time_series`);
  url.searchParams.set('symbol', target.sourceSymbol);
  url.searchParams.set('interval', '1day');
  url.searchParams.set('start_date', target.startDate);
  url.searchParams.set('end_date', target.endDate);
  url.searchParams.set('outputsize', '5000');
  url.searchParams.set('adjust', 'splits');
  url.searchParams.set('apikey', apiKey);

  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    return { ok: false, reason: `network: ${err.message}`, bars: [] };
  }

  if (!response.ok) {
    return { ok: false, reason: `http ${response.status}`, bars: [] };
  }

  const body = await response.json();
  if (body?.status === 'error') {
    return { ok: false, reason: body.message || 'twelvedata error', bars: [] };
  }

  const currency = body?.meta?.currency || target.priceCurrency || null;
  const bars = (Array.isArray(body?.values) ? body.values : [])
    .map((row) => {
      const date = row?.datetime ? String(row.datetime).slice(0, 10) : null;
      const close = Number(row?.close);
      if (!date || !Number.isFinite(close)) {
        return null;
      }

      return {
        instrumentKey: target.instrumentKey,
        ticker: target.ticker,
        isin: target.isin,
        barDate: date,
        close,
        currency,
        source: FETCH_SOURCE,
        sourceSymbol: target.sourceSymbol,
      };
    })
    .filter(Boolean);

  return { ok: true, symbol: target.sourceSymbol, bars };
}

function upsertHistoricalPriceRows(rows, defaultSource = 'manual') {
  const stmt = db.prepare(`
    INSERT INTO historical_prices (
      instrument_key, ticker, isin, bar_date, close, currency, source, source_symbol, fetched_at
    )
    VALUES (
      @instrumentKey, @ticker, @isin, @barDate, @close, @currency, @source, @sourceSymbol, datetime('now')
    )
    ON CONFLICT(instrument_key, bar_date, source) DO UPDATE SET
      ticker = excluded.ticker,
      isin = excluded.isin,
      close = excluded.close,
      currency = excluded.currency,
      source_symbol = excluded.source_symbol,
      fetched_at = datetime('now')
  `);

  const preparedRows = rows
    .map((row) => {
      const instrumentKey = row.instrumentKey || getInstrumentKeyFromParts(row.isin, row.ticker);
      const barDate = toDateKey(row.barDate || row.date);
      const close = Number(row.close);
      const { currency, scale } = normalisePriceCurrency(row.currency);

      if (!instrumentKey || !barDate || !Number.isFinite(close) || close <= 0) {
        return null;
      }

      return {
        instrumentKey,
        ticker: row.ticker || null,
        isin: row.isin || null,
        barDate,
        close: close * scale,
        currency,
        source: row.source || defaultSource,
        sourceSymbol: row.sourceSymbol || row.source_symbol || null,
      };
    })
    .filter(Boolean);

  const transaction = db.transaction((items) => {
    for (const row of items) {
      stmt.run(row);
    }
  });
  transaction(preparedRows);

  return preparedRows.length;
}

function getHistoricalPricesByInstrument({ instrumentKey, ticker, isin, startDate, endDate }) {
  const conditions = [];
  const params = [];

  if (instrumentKey) {
    conditions.push('instrument_key = ?');
    params.push(instrumentKey);
  }

  if (isin) {
    conditions.push('isin = ?');
    params.push(isin);
  }

  if (ticker) {
    conditions.push('ticker = ?');
    params.push(ticker);
  }

  if (conditions.length === 0) {
    return { pricesByDate: new Map(), currency: null, sources: [], sourceSymbols: [] };
  }

  params.push(startDate, endDate);
  const rows = db.prepare(`
    SELECT bar_date, close, currency, source, source_symbol
    FROM historical_prices
    WHERE (${conditions.join(' OR ')})
      AND bar_date BETWEEN ? AND ?
    ORDER BY bar_date ASC, fetched_at ASC
  `).all(...params);

  const byDate = new Map();
  const sources = new Set();
  const sourceSymbols = new Set();
  const currencies = new Set();

  for (const row of rows) {
    const close = Number(row.close);
    if (!Number.isFinite(close) || close <= 0) {
      continue;
    }

    const priority = SOURCE_PRIORITY[row.source] ?? 0;
    const existing = byDate.get(row.bar_date);
    const existingPriority = existing ? SOURCE_PRIORITY[existing.source] ?? 0 : -1;
    if (!existing || priority >= existingPriority) {
      byDate.set(row.bar_date, {
        close,
        currency: row.currency || null,
        source: row.source,
      });
    }

    sources.add(row.source);
    if (row.source_symbol) {
      sourceSymbols.add(row.source_symbol);
    }
    if (row.currency) {
      currencies.add(row.currency);
    }
  }

  const pricesByDate = new Map();
  for (const [date, row] of byDate.entries()) {
    pricesByDate.set(date, row.close);
  }

  return {
    pricesByDate,
    currency: currencies.values().next().value || null,
    sources: [...sources].sort(),
    sourceSymbols: [...sourceSymbols].sort(),
  };
}

async function refreshHistoricalPricesForTickers(tickers, { maxAgeDays = 30 } = {}) {
  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: 'TWELVEDATA_API_KEY is not set',
      requested: 0,
      fetched: 0,
      cached: 0,
      failed: 0,
      insertedRows: 0,
      durationMs: 0,
    };
  }

  const start = Date.now();
  const unique = [...new Set((tickers || []).filter(Boolean))];
  let fetched = 0;
  let cached = 0;
  let failed = 0;
  let insertedRows = 0;
  const failures = [];

  for (const ticker of unique) {
    const target = resolveRefreshTarget(ticker);
    if (!target) {
      failed += 1;
      failures.push({ ticker, reason: 'no_holding_window' });
      continue;
    }

    const lastFetchedAt = getLastFetchedAt(target.instrumentKey, FETCH_SOURCE);
    if (isFetchFresh(lastFetchedAt, maxAgeDays)) {
      cached += 1;
      continue;
    }

    const result = await fetchTimeSeriesFromTwelveData(target, apiKey);
    if (result.ok) {
      const count = upsertHistoricalPriceRows(result.bars, FETCH_SOURCE);
      insertedRows += count;
      markFetched(target.instrumentKey, FETCH_SOURCE);
      fetched += 1;
    } else {
      failed += 1;
      failures.push({ ticker, symbol: target.sourceSymbol, reason: result.reason });
    }

    await sleep(RATE_LIMIT_DELAY_MS);
  }

  return {
    ok: true,
    requested: unique.length,
    fetched,
    cached,
    failed,
    insertedRows,
    failures,
    durationMs: Date.now() - start,
  };
}

module.exports = {
  getHistoricalPricesByInstrument,
  normalisePriceCurrency,
  refreshHistoricalPricesForTickers,
  resolveRefreshTarget,
  upsertHistoricalPriceRows,
};
