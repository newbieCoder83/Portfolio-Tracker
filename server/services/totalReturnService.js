const YahooFinance = require('yahoo-finance2').default;
const db = require('../db/connection');
const cache = require('./cache');
const { getYahooSymbolCandidates } = require('../utils/tickerUtils');
const { getManualSplitOverridesByDate } = require('./corporateActionsService');
const { getHistoricalPricesByInstrument } = require('./historicalPriceService');

const yahooFinance = new YahooFinance({
  validation: {
    logErrors: false,
  },
});
const PRICE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FAILED_PRICE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SUMMARY_RECONCILIATION_TOLERANCE_PCT = 2;
const HOLDING_QUANTITY_TOLERANCE = 0.0001;
const FACE_VALUE_TOLERANCE = 10;
const NET_DEPOSITS_TOLERANCE = 0.02;
const priceWarningKeys = new Set();

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
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

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildDateRange(startDate, endDate) {
  const dates = [];
  let current = startDate;

  while (current <= endDate) {
    dates.push(current);
    current = addDays(current, 1);
  }

  return dates;
}

function addEvent(eventsByDate, date, event) {
  if (!date) {
    return;
  }

  if (!eventsByDate.has(date)) {
    eventsByDate.set(date, []);
  }

  eventsByDate.get(date).push(event);
}

function getSignedTransactionAmount(transaction) {
  const amount = Math.abs(Number(transaction.amount ?? 0));

  if (!Number.isFinite(amount) || amount === 0) {
    return 0;
  }

  if (transaction.type === 'DEPOSIT') {
    return amount;
  }

  if (transaction.type === 'WITHDRAW' || transaction.type === 'FEE') {
    return -amount;
  }

  return Number(transaction.amount ?? 0) || 0;
}

function getNetDepositAmount(transaction) {
  if (transaction.type === 'DEPOSIT' || transaction.type === 'WITHDRAW') {
    return getSignedTransactionAmount(transaction);
  }

  if (transaction.type === 'TRANSFER') {
    return Number(transaction.amount ?? 0) || 0;
  }

  return 0;
}

function normaliseYahooCurrency(currency) {
  if (!currency) {
    return { currency: null, scale: 1 };
  }

  if (currency === 'GBp') {
    return { currency: 'GBP', scale: 0.01 };
  }

  const upper = String(currency).toUpperCase();

  if (upper === 'GBP' || upper === 'GBX' || upper === 'GBPENCE' || upper === 'GBP.P') {
    return upper === 'GBP'
      ? { currency: 'GBP', scale: 1 }
      : { currency: 'GBP', scale: 0.01 };
  }

  return { currency: upper, scale: 1 };
}

function inferYahooCurrency(t212Ticker, yahooTicker) {
  const t212Value = String(t212Ticker || '');
  const yahooValue = String(yahooTicker || '');

  if (t212Value.includes('_US_') || /^[A-Z]+$/.test(yahooValue)) {
    return 'USD';
  }

  if (yahooValue.endsWith('.L')) {
    return 'GBp';
  }

  if (['.AS', '.DE', '.MC', '.MI', '.PA'].some((suffix) => yahooValue.endsWith(suffix))) {
    return 'EUR';
  }

  if (yahooValue.endsWith('.TO')) return 'CAD';
  if (yahooValue.endsWith('.AX')) return 'AUD';
  if (yahooValue.endsWith('.HK')) return 'HKD';

  return null;
}

function storePrice(priceMap, date, price) {
  if (!date || !isValidMarketPrice(price)) {
    return;
  }

  priceMap.set(date, price);
}

function parsePositiveNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseQuotePrice(quote) {
  return parsePositiveNumber(quote?.close) ?? parsePositiveNumber(quote?.adjclose);
}

function isValidMarketPrice(value) {
  return Number.isFinite(value) && value > 0;
}

function getChartQuotes(chart) {
  return (chart?.quotes ?? []).filter((quote) => {
    return toDateKey(quote?.date) && parseQuotePrice(quote) !== null;
  });
}

const dateFormattersByTimeZone = new Map();

function toDateKeyInTimeZone(value, timeZone) {
  if (!timeZone) {
    return toDateKey(value);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  try {
    if (!dateFormattersByTimeZone.has(timeZone)) {
      dateFormattersByTimeZone.set(
        timeZone,
        new Intl.DateTimeFormat('en-US', {
          day: '2-digit',
          month: '2-digit',
          timeZone,
          year: 'numeric',
        })
      );
    }

    const parts = dateFormattersByTimeZone.get(timeZone).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch (err) {
    return toDateKey(value);
  }
}

async function fetchYahooChart(symbol, startDate, endDate) {
  const cacheKey = `yahoo-chart:${symbol}:${startDate}:${endDate}`;
  const cached = cache.get(cacheKey);

  if (cached !== undefined) {
    if (cached.ok) {
      return cached.data;
    }

    const err = new Error(cached.message);
    err.cachedPriceFailure = true;
    throw err;
  }

  try {
    const result = await yahooFinance.chart(
      symbol,
      {
        period1: startDate,
        period2: addDays(endDate, 1),
        interval: '1d',
        includePrePost: false,
        events: 'split',
      },
      { validateResult: false }
    );

    if (getChartQuotes(result).length === 0) {
      throw new Error('No usable historical price quotes returned');
    }

    cache.set(cacheKey, { ok: true, data: result }, PRICE_CACHE_TTL_MS);
    return result;
  } catch (err) {
    cache.set(cacheKey, { ok: false, message: err.message }, FAILED_PRICE_CACHE_TTL_MS);
    throw err;
  }
}

function warnPriceIssueOnce(key, message) {
  if (priceWarningKeys.has(key)) {
    return;
  }

  priceWarningKeys.add(key);
  console.warn(message);
}

function buildFillPriceSeriesByTicker(orders) {
  const totalsByTickerAndDate = new Map();

  for (const order of orders) {
    if (order.fill_type === 'STOCK_SPLIT') {
      continue;
    }

    const date = getOrderDate(order);
    const quantity = Math.abs(getOrderQuantity(order));
    const walletNetValue = Math.abs(Number(order.fill_wallet_net_value ?? 0));

    if (!date || !order.ticker || quantity <= 0 || !Number.isFinite(walletNetValue) || walletNetValue <= 0) {
      continue;
    }

    if (!totalsByTickerAndDate.has(order.ticker)) {
      totalsByTickerAndDate.set(order.ticker, new Map());
    }

    const tickerTotals = totalsByTickerAndDate.get(order.ticker);
    const existing = tickerTotals.get(date) || { value: 0, quantity: 0 };
    tickerTotals.set(date, {
      value: existing.value + walletNetValue,
      quantity: existing.quantity + quantity,
    });
  }

  const pricesByTicker = new Map();
  for (const [ticker, totalsByDate] of totalsByTickerAndDate.entries()) {
    const pricesByDate = new Map();

    for (const [date, totals] of totalsByDate.entries()) {
      if (totals.quantity > 0) {
        pricesByDate.set(date, totals.value / totals.quantity);
      }
    }

    pricesByTicker.set(ticker, pricesByDate);
  }

  return pricesByTicker;
}

async function buildPriceSeries(ticker, startDate, endDate, accountCurrency, fallbackPricesByDate) {
  const candidates = getYahooSymbolCandidates(ticker);
  const failures = [];

  for (const yahooTicker of candidates) {
    try {
      const chart = await fetchYahooChart(yahooTicker, startDate, endDate);
      const { currency, scale } = normaliseYahooCurrency(
        chart?.meta?.currency || inferYahooCurrency(ticker, yahooTicker)
      );
      const pricesByDate = new Map();

      for (const quote of getChartQuotes(chart)) {
        const price = parseQuotePrice(quote);
        storePrice(pricesByDate, toDateKey(quote.date), price * scale);
      }

      return {
        ticker,
        yahooTicker,
        currency,
        pricesByDate,
        fallbackPricesByDate,
        estimatedFromFillsOnly: false,
      };
    } catch (err) {
      failures.push(`${yahooTicker}: ${err.message}`);
    }
  }

  const cachedPrices = getHistoricalPricesByInstrument({
    instrumentKey: `ticker:${ticker}`,
    ticker,
    startDate,
    endDate,
  });

  if (cachedPrices.pricesByDate.size > 0) {
    return {
      ticker,
      yahooTicker: null,
      currency: cachedPrices.currency || accountCurrency,
      pricesByDate: cachedPrices.pricesByDate,
      fallbackPricesByDate,
      estimatedFromFillsOnly: false,
      historicalFromCache: true,
      historicalPriceSources: cachedPrices.sources,
      historicalSourceSymbols: cachedPrices.sourceSymbols,
      failureMessage: failures.join('; '),
    };
  }

  if (fallbackPricesByDate && fallbackPricesByDate.size > 0) {
    return {
      ticker,
      yahooTicker: null,
      currency: accountCurrency,
      pricesByDate: new Map(),
      fallbackPricesByDate,
      estimatedFromFillsOnly: true,
      failureMessage: failures.join('; '),
    };
  }

  throw new Error(failures.join('; ') || 'No Yahoo symbol candidates available');
}

async function buildFxSeries(fromCurrency, toCurrency, startDate, endDate) {
  if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) {
    return new Map();
  }

  const symbol = `${fromCurrency}${toCurrency}=X`;
  const chart = await fetchYahooChart(symbol, startDate, endDate);
  const pricesByDate = new Map();
  const exchangeTimeZone = chart?.meta?.exchangeTimezoneName;

  for (const quote of getChartQuotes(chart)) {
    storePrice(pricesByDate, toDateKeyInTimeZone(quote.date, exchangeTimeZone), parseQuotePrice(quote));
  }

  return pricesByDate;
}

function getLastKnownValue(series, date, previousValue) {
  if (series.has(date) && isValidMarketPrice(series.get(date))) {
    return series.get(date);
  }

  if (isValidMarketPrice(previousValue)) {
    return previousValue;
  }

  let lastDate = null;
  let lastValue = undefined;

  for (const [seriesDate, value] of series.entries()) {
    if (seriesDate <= date && isValidMarketPrice(value) && (!lastDate || seriesDate > lastDate)) {
      lastDate = seriesDate;
      lastValue = value;
    }
  }

  return lastValue;
}

function getOrderDate(order) {
  return toDateKey(order.fill_filled_at || order.order_created_at);
}

function getOrderQuantity(order) {
  const quantity = Math.abs(Number(order.fill_quantity ?? order.order_filled_quantity ?? 0));

  if (!Number.isFinite(quantity) || quantity === 0) {
    return 0;
  }

  return order.side === 'SELL' ? -quantity : quantity;
}

function getOrderCashAmount(order) {
  const walletNetValue = Math.abs(Number(order.fill_wallet_net_value ?? 0));

  if (!Number.isFinite(walletNetValue) || walletNetValue === 0) {
    return 0;
  }

  if (order.side === 'BUY') {
    return -walletNetValue;
  }

  if (order.side === 'SELL') {
    return walletNetValue;
  }

  return Number(order.fill_wallet_net_value ?? 0) || 0;
}

function getEarliestDate(items, dateGetter) {
  return items
    .map(dateGetter)
    .filter(Boolean)
    .sort()[0] ?? null;
}

function buildHoldingDiagnostics(holdings, positions) {
  const positionsByTicker = new Map(positions.map((position) => [position.ticker, position]));
  const seenTickers = new Set();
  const staleHoldings = [];
  const mismatchedHoldings = [];

  for (const [ticker, quantity] of holdings.entries()) {
    if (Math.abs(quantity) <= HOLDING_QUANTITY_TOLERANCE) {
      continue;
    }

    seenTickers.add(ticker);
    const position = positionsByTicker.get(ticker);

    if (!position) {
      staleHoldings.push({ ticker, reconstructedQty: quantity, currentQty: 0 });
      continue;
    }

    const currentQuantity = Number(position.quantity ?? 0);
    if (Math.abs(quantity - currentQuantity) > HOLDING_QUANTITY_TOLERANCE) {
      mismatchedHoldings.push({
        ticker,
        reconstructedQty: quantity,
        currentQty: currentQuantity,
        ratio: currentQuantity !== 0 ? quantity / currentQuantity : null,
      });
    }
  }

  for (const position of positions) {
    const currentQuantity = Number(position.quantity ?? 0);
    if (
      Math.abs(currentQuantity) > HOLDING_QUANTITY_TOLERANCE
      && !seenTickers.has(position.ticker)
    ) {
      mismatchedHoldings.push({
        ticker: position.ticker,
        reconstructedQty: 0,
        currentQty: currentQuantity,
        ratio: 0,
      });
    }
  }

  return {
    staleHoldingCount: staleHoldings.length,
    mismatchedHoldingCount: mismatchedHoldings.length,
    staleHoldings,
    mismatchedHoldings,
  };
}

function getSummaryDeltaPercent(reconstructedValue, summaryValue) {
  if (!Number.isFinite(reconstructedValue) || !Number.isFinite(summaryValue) || summaryValue === 0) {
    return null;
  }

  return Math.abs((reconstructedValue - summaryValue) / summaryValue) * 100;
}

function buildUnavailableReason({ transactionHistoryIncomplete, holdingsUnreconciled, latestValueOutsideTolerance }) {
  const reasons = [];

  if (transactionHistoryIncomplete) {
    reasons.push('transaction history is incomplete');
  }

  if (holdingsUnreconciled) {
    reasons.push('reconstructed holdings do not match current positions');
  }

  if (latestValueOutsideTolerance) {
    reasons.push('the latest reconstructed value is more than 2% away from the Trading 212 account summary');
  }

  if (reasons.length === 0) {
    return null;
  }

  if (reasons.length === 1) {
    return `Total return history is unavailable because ${reasons[0]}.`;
  }

  return `Total return history is unavailable because ${reasons.slice(0, -1).join(', ')} and ${reasons[reasons.length - 1]}.`;
}

function buildSuspiciousValueDrops(points) {
  const drops = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const previousValue = Number(previous.totalValue);
    const currentValue = Number(current.totalValue);

    if (!Number.isFinite(previousValue) || previousValue <= 0 || !Number.isFinite(currentValue)) {
      continue;
    }

    const change = currentValue - previousValue;
    const changePct = (change / previousValue) * 100;
    const netDepositChange = Number(current.netDeposits) - Number(previous.netDeposits);

    if (
      changePct < -50
      && (
        !Number.isFinite(netDepositChange)
        || Math.abs(netDepositChange) < Math.abs(change) * 0.5
      )
    ) {
      drops.push({
        date: current.date,
        previousDate: previous.date,
        previousTotalValue: roundMoney(previousValue),
        totalValue: roundMoney(currentValue),
        change: roundMoney(change),
        changePct: Math.round(changePct * 100) / 100,
        netDepositChange: Number.isFinite(netDepositChange) ? roundMoney(netDepositChange) : null,
      });
    }
  }

  return drops;
}

function getSyncState(key) {
  const row = db.prepare('SELECT value FROM sync_state WHERE key = ?').get(key);
  return row ? row.value : null;
}

function buildExportUnavailableReason(failures) {
  const reasons = failures.filter(Boolean);

  if (reasons.length === 0) {
    return null;
  }

  if (reasons.length === 1) {
    return `Total return history is unavailable because ${reasons[0]}.`;
  }

  return `Total return history is unavailable because ${reasons.slice(0, -1).join(', ')} and ${reasons[reasons.length - 1]}.`;
}

function isExportBuyAction(action) {
  return ['Market buy', 'Limit buy', 'Stock distribution'].includes(action);
}

function isExportSellAction(action) {
  return ['Market sell', 'Limit sell'].includes(action);
}

function isExportSplitAction(action) {
  return action === 'Stock split open' || action === 'Stock split close';
}

function isExportDividendAction(action) {
  return String(action || '').startsWith('Dividend');
}

function getExportTradeQuantity(row) {
  const quantity = Math.abs(Number(row.shares ?? 0));

  if (!Number.isFinite(quantity) || quantity === 0) {
    return 0;
  }

  if (isExportSellAction(row.action)) {
    return -quantity;
  }

  if (isExportBuyAction(row.action)) {
    return quantity;
  }

  return 0;
}

function getExportTradeCashAmount(row) {
  const total = Math.abs(Number(row.total ?? 0));

  if (!Number.isFinite(total) || total === 0) {
    return 0;
  }

  if (isExportBuyAction(row.action)) {
    return -total;
  }

  if (isExportSellAction(row.action)) {
    return total;
  }

  return Number(row.total ?? 0) || 0;
}

function getExportCashAmount(row) {
  const total = Number(row.total ?? 0);

  if (!Number.isFinite(total)) {
    return 0;
  }

  if (isExportBuyAction(row.action) || isExportSellAction(row.action)) {
    return getExportTradeCashAmount(row);
  }

  if (
    row.action === 'Deposit'
    || row.action === 'Withdrawal'
    || isExportDividendAction(row.action)
    || row.action === 'Interest on cash'
    || row.action === 'Dividend adjustment'
    || row.action === 'ADR Fee'
    || row.action === 'Result adjustment'
  ) {
    return total;
  }

  return 0;
}

function getExportNetDepositAmount(row) {
  if (row.action === 'Deposit' || row.action === 'Withdrawal') {
    return Number(row.total ?? 0) || 0;
  }

  return 0;
}

function getInstrumentKeyFromParts(isin, ticker) {
  if (isin) {
    return `isin:${isin}`;
  }

  return ticker ? `ticker:${ticker}` : null;
}

function getExportInstrumentKey(row) {
  return getInstrumentKeyFromParts(row.isin, row.ticker);
}

function buildInstrumentLookup({ instruments, orders, positions }) {
  const byIsin = new Map();
  const byTicker = new Map();

  function addInstrument({ isin, ticker, name, priceCurrency }) {
    if (!ticker) {
      return;
    }

    const info = {
      isin: isin || null,
      t212Ticker: ticker,
      rawTicker: ticker,
      name: name || ticker,
      priceCurrency: priceCurrency || null,
    };

    if (isin && !byIsin.has(isin)) {
      byIsin.set(isin, info);
    }

    if (!byTicker.has(ticker)) {
      byTicker.set(ticker, info);
    }
  }

  // Order matters: positions first (highest priority), then orders, then
  // instruments. addInstrument is first-write-wins per ISIN, so this means
  // when a single ISIN has multiple T212 listings (e.g. LRCX_US_EQ for the
  // US listing and LAR0d_EQ for the Frankfurt listing), we resolve to the
  // ticker the user actually holds. Otherwise Yahoo gets called with the
  // thin foreign listing, returns sparse data without split events, and
  // LRCX-style splits get silently dropped.
  for (const position of positions) {
    addInstrument({
      isin: position.instrument_isin,
      ticker: position.ticker,
      name: position.instrument_name,
      priceCurrency: position.instrument_currency,
    });
  }

  for (const order of orders) {
    addInstrument({
      isin: order.instrument_isin,
      ticker: order.ticker,
      name: order.instrument_name,
      priceCurrency: order.instrument_currency,
    });
  }

  for (const instrument of instruments) {
    addInstrument({
      isin: instrument.isin,
      ticker: instrument.ticker,
      name: instrument.name || instrument.short_name,
      priceCurrency: instrument.currency_code,
    });
  }

  return { byIsin, byTicker };
}

function getExportInstrumentInfo(row, lookup) {
  const key = getExportInstrumentKey(row);

  if (!key) {
    return null;
  }

  const mapped = row.isin ? lookup.byIsin.get(row.isin) : lookup.byTicker.get(row.ticker);
  return {
    key,
    isin: row.isin || mapped?.isin || null,
    t212Ticker: mapped?.t212Ticker || null,
    rawTicker: row.ticker || mapped?.rawTicker || null,
    name: row.name || mapped?.name || row.ticker || key,
    priceCurrency: row.price_currency || mapped?.priceCurrency || null,
  };
}

function rawTickerToYahoo(rawTicker, priceCurrency) {
  if (!rawTicker) {
    return null;
  }

  const ticker = String(rawTicker).trim();

  if (!ticker) {
    return null;
  }

  if (priceCurrency === 'GBX' || priceCurrency === 'GBp') {
    return `${ticker}.L`;
  }

  return ticker;
}

function getExportYahooCandidates(info) {
  const candidates = [];

  if (info.t212Ticker) {
    candidates.push(...getYahooSymbolCandidates(info.t212Ticker));
  }

  const rawCandidate = rawTickerToYahoo(info.rawTicker, info.priceCurrency);
  if (rawCandidate) {
    candidates.push(rawCandidate);
  }

  return [...new Set(candidates.filter(Boolean))];
}

function inferExportYahooCurrency(info, yahooTicker) {
  if (info.priceCurrency) {
    return info.priceCurrency;
  }

  return inferYahooCurrency(info.t212Ticker || info.rawTicker, yahooTicker);
}

function getChartSplitsByDate(chart) {
  const splitsByDate = new Map();

  for (const split of chart?.events?.splits ?? []) {
    const date = toDateKey(split.date);
    const numerator = Number(split.numerator);
    const denominator = Number(split.denominator);

    if (!date || !Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
      continue;
    }

    splitsByDate.set(date, (splitsByDate.get(date) || 1) * (numerator / denominator));
  }

  return splitsByDate;
}

function isValidSplitFactor(factor) {
  return Number.isFinite(factor) && factor > 0 && factor !== 1;
}

function mergeSplitMaps({ derivedSplits = new Map(), yahooSplits = new Map(), manualSplits = new Map() }) {
  // Priority is manual override > Yahoo chart split > T212-derived split.
  const merged = new Map();

  for (const [date, factor] of derivedSplits.entries()) {
    if (date && isValidSplitFactor(factor)) {
      merged.set(date, factor);
    }
  }

  for (const [date, factor] of yahooSplits.entries()) {
    if (date && isValidSplitFactor(factor)) {
      merged.set(date, factor);
    }
  }

  for (const [date, factor] of manualSplits.entries()) {
    if (date && isValidSplitFactor(factor)) {
      merged.set(date, factor);
    }
  }
  return merged;
}

function getCumulativeSplitFactorAfterDate(splitsByDate, date) {
  let factor = 1;

  for (const [splitDate, splitFactor] of splitsByDate?.entries() ?? []) {
    if (splitDate > date && isValidSplitFactor(splitFactor)) {
      factor *= splitFactor;
    }
  }

  return factor;
}

function adjustQuantityForPriceBasis(quantity, date, priceSeries) {
  if (!priceSeries?.pricesAreSplitAdjusted) {
    return quantity;
  }

  return quantity * getCumulativeSplitFactorAfterDate(priceSeries.splitsByDate, date);
}

async function buildExportPriceSeries(
  info,
  startDate,
  endDate,
  accountCurrency,
  fallbackPricesByDate,
  derivedSplitsByDate = new Map()
) {
  const candidates = getExportYahooCandidates(info);
  const failures = [];
  const t212Ticker = info.t212Ticker || info.rawTicker;
  const manualSplits = t212Ticker ? getManualSplitOverridesByDate(t212Ticker) : new Map();

  for (const yahooTicker of candidates) {
    try {
      const chart = await fetchYahooChart(yahooTicker, startDate, endDate);
      const { currency, scale } = normaliseYahooCurrency(
        chart?.meta?.currency || inferExportYahooCurrency(info, yahooTicker)
      );
      const pricesByDate = new Map();

      for (const quote of getChartQuotes(chart)) {
        const price = parseQuotePrice(quote);
        storePrice(pricesByDate, toDateKey(quote.date), price * scale);
      }

      return {
        key: info.key,
        ticker: t212Ticker,
        yahooTicker,
        currency,
        pricesByDate,
        splitsByDate: mergeSplitMaps({
          derivedSplits: derivedSplitsByDate,
          yahooSplits: getChartSplitsByDate(chart),
          manualSplits,
        }),
        pricesAreSplitAdjusted: true,
        fallbackPricesByDate,
        estimatedFromFillsOnly: false,
      };
    } catch (err) {
      failures.push(`${yahooTicker}: ${err.message}`);
    }
  }

  const cachedPrices = getHistoricalPricesByInstrument({
    instrumentKey: info.key,
    ticker: t212Ticker,
    isin: info.isin,
    startDate,
    endDate,
  });

  if (cachedPrices.pricesByDate.size > 0) {
    return {
      key: info.key,
      ticker: t212Ticker,
      yahooTicker: null,
      currency: cachedPrices.currency || accountCurrency,
      pricesByDate: cachedPrices.pricesByDate,
      splitsByDate: mergeSplitMaps({
        derivedSplits: derivedSplitsByDate,
        manualSplits,
      }),
      pricesAreSplitAdjusted: false,
      fallbackPricesByDate,
      estimatedFromFillsOnly: false,
      historicalFromCache: true,
      historicalPriceSources: cachedPrices.sources,
      historicalSourceSymbols: cachedPrices.sourceSymbols,
      failureMessage: failures.join('; '),
    };
  }

  if (fallbackPricesByDate && fallbackPricesByDate.size > 0) {
    return {
      key: info.key,
      ticker: t212Ticker,
      yahooTicker: null,
      currency: accountCurrency,
      pricesByDate: new Map(),
      splitsByDate: mergeSplitMaps({
        derivedSplits: derivedSplitsByDate,
        manualSplits,
      }),
      pricesAreSplitAdjusted: false,
      fallbackPricesByDate,
      estimatedFromFillsOnly: true,
      failureMessage: failures.join('; '),
    };
  }

  throw new Error(failures.join('; ') || 'No Yahoo symbol candidates available');
}

function addInstrumentInfo(instrumentsByKey, info) {
  if (!info?.key || instrumentsByKey.has(info.key)) {
    return;
  }

  instrumentsByKey.set(info.key, info);
}

function buildExportFillPriceSeries(exportRows, apiOrders, lookup) {
  const totalsByKeyAndDate = new Map();

  function addFill({ key, date, quantity, total }) {
    const absQuantity = Math.abs(Number(quantity ?? 0));
    const absTotal = Math.abs(Number(total ?? 0));

    if (!key || !date || absQuantity <= 0 || !Number.isFinite(absTotal) || absTotal <= 0) {
      return;
    }

    if (!totalsByKeyAndDate.has(key)) {
      totalsByKeyAndDate.set(key, new Map());
    }

    const totalsByDate = totalsByKeyAndDate.get(key);
    const existing = totalsByDate.get(date) || { value: 0, quantity: 0 };
    totalsByDate.set(date, {
      value: existing.value + absTotal,
      quantity: existing.quantity + absQuantity,
    });
  }

  for (const row of exportRows) {
    if (!isExportBuyAction(row.action) && !isExportSellAction(row.action)) {
      continue;
    }

    const info = getExportInstrumentInfo(row, lookup);
    addFill({
      key: info?.key,
      date: toDateKey(row.date_time),
      quantity: row.shares,
      total: row.total,
    });
  }

  for (const order of apiOrders) {
    if (order.fill_type === 'STOCK_SPLIT') {
      continue;
    }

    addFill({
      key: getInstrumentKeyFromParts(order.instrument_isin, order.ticker),
      date: getOrderDate(order),
      quantity: getOrderQuantity(order),
      total: order.fill_wallet_net_value,
    });
  }

  const pricesByKey = new Map();
  for (const [key, totalsByDate] of totalsByKeyAndDate.entries()) {
    const pricesByDate = new Map();

    for (const [date, totals] of totalsByDate.entries()) {
      if (totals.quantity > 0) {
        pricesByDate.set(date, totals.value / totals.quantity);
      }
    }

    pricesByKey.set(key, pricesByDate);
  }

  return pricesByKey;
}

function buildDerivedSplitMaps({ exportRows, apiOrders, lookup }) {
  const pairsByKeyAndDate = new Map();

  function addSplitSide({ key, date, side, quantity }) {
    const absQuantity = Math.abs(Number(quantity ?? 0));

    if (!key || !date || !side || !Number.isFinite(absQuantity) || absQuantity <= 0) {
      return;
    }

    const pairKey = `${key}|${date}`;
    const existing = pairsByKeyAndDate.get(pairKey) || { key, date, closeQuantity: 0, openQuantity: 0 };

    if (side === 'open') {
      existing.openQuantity += absQuantity;
    } else if (side === 'close') {
      existing.closeQuantity += absQuantity;
    }

    pairsByKeyAndDate.set(pairKey, existing);
  }

  for (const row of exportRows) {
    if (!isExportSplitAction(row.action)) {
      continue;
    }

    const info = getExportInstrumentInfo(row, lookup);
    addSplitSide({
      key: info?.key,
      date: toDateKey(row.date_time),
      side: row.action === 'Stock split open' ? 'open' : 'close',
      quantity: row.shares,
    });
  }

  for (const order of apiOrders) {
    if (order.fill_type !== 'STOCK_SPLIT') {
      continue;
    }

    addSplitSide({
      key: getInstrumentKeyFromParts(order.instrument_isin, order.ticker),
      date: getOrderDate(order),
      side: order.side === 'BUY' ? 'open' : order.side === 'SELL' ? 'close' : null,
      quantity: order.fill_quantity ?? order.order_filled_quantity,
    });
  }

  const splitsByKey = new Map();
  for (const pair of pairsByKeyAndDate.values()) {
    if (pair.openQuantity <= 0 || pair.closeQuantity <= 0) {
      continue;
    }

    const factor = pair.openQuantity / pair.closeQuantity;
    if (!isValidSplitFactor(factor)) {
      continue;
    }

    if (!splitsByKey.has(pair.key)) {
      splitsByKey.set(pair.key, new Map());
    }
    splitsByKey.get(pair.key).set(pair.date, factor);
  }

  return splitsByKey;
}

async function fetchExportMarketData(instrumentsByKey, exportRows, apiOrders, startDate, endDate, accountCurrency, lookup) {
  const pricesByKey = new Map();
  const missingSymbols = [];
  const estimatedSymbols = [];
  const historicalPriceSymbols = [];
  const currencies = new Set();
  const fallbackPricesByKey = buildExportFillPriceSeries(exportRows, apiOrders, lookup);
  const derivedSplitsByKey = buildDerivedSplitMaps({ exportRows, apiOrders, lookup });

  for (const info of instrumentsByKey.values()) {
    try {
      const priceSeries = await buildExportPriceSeries(
        info,
        startDate,
        endDate,
        accountCurrency,
        fallbackPricesByKey.get(info.key) || new Map(),
        derivedSplitsByKey.get(info.key) || new Map()
      );
      pricesByKey.set(info.key, priceSeries);

      if (priceSeries.currency && priceSeries.currency !== accountCurrency) {
        currencies.add(priceSeries.currency);
      }

      if (priceSeries.estimatedFromFillsOnly) {
        estimatedSymbols.push(info.t212Ticker || info.rawTicker || info.key);
        warnPriceIssueOnce(
          `export-fill-fallback:${info.key}`,
          `[TotalReturn] Using fill-price fallback for ${info.name}; Yahoo prices unavailable (${priceSeries.failureMessage})`
        );
      }

      if (priceSeries.historicalFromCache) {
        historicalPriceSymbols.push(info.t212Ticker || info.rawTicker || info.key);
      }
    } catch (err) {
      warnPriceIssueOnce(
        `export-missing:${info.key}`,
        `[TotalReturn] No usable price history for ${info.name}; excluding it while held (${err.message})`
      );
      missingSymbols.push(info.t212Ticker || info.rawTicker || info.key);
    }
  }

  const fxByCurrency = new Map();
  for (const currency of currencies) {
    try {
      fxByCurrency.set(currency, await buildFxSeries(currency, accountCurrency, startDate, endDate));
    } catch (err) {
      const symbol = `${currency}${accountCurrency}=X`;
      console.warn(`[TotalReturn] Failed to fetch FX prices for ${symbol}:`, err.message);
      missingSymbols.push(symbol);
    }
  }

  return {
    estimatedSymbols,
    fxByCurrency,
    historicalPriceSymbols,
    missingSymbols,
    pricesByKey,
  };
}

function buildEvents({ transactions, orders, dividends, depositFillRows = [] }) {
  const eventsByDate = new Map();
  const candidateDates = [];

  // T212's /history/transactions endpoint has a limited retention window, so
  // DEPOSIT/WITHDRAW rows often don't go back to account open even when orders
  // do. When we're given export rows (CSV export covers full history), use
  // them to backfill deposits/withdrawals for dates strictly before the
  // earliest API transaction — no double-counting on covered dates.
  let earliestTransactionDate = null;
  for (const transaction of transactions) {
    const date = toDateKey(transaction.date_time);
    if (date && (earliestTransactionDate === null || date < earliestTransactionDate)) {
      earliestTransactionDate = date;
    }
  }

  for (const row of depositFillRows) {
    if (row.action !== 'Deposit' && row.action !== 'Withdrawal') {
      continue;
    }
    const date = toDateKey(row.date_time);
    if (!date) {
      continue;
    }
    if (earliestTransactionDate !== null && date >= earliestTransactionDate) {
      continue;
    }
    const netDepositAmount = getExportNetDepositAmount(row);
    if (netDepositAmount === 0) {
      continue;
    }
    candidateDates.push(date);
    addEvent(eventsByDate, date, {
      type: 'transaction',
      cashAmount: netDepositAmount,
      netDepositAmount,
    });
  }

  for (const transaction of transactions) {
    const date = toDateKey(transaction.date_time);
    if (!date) {
      continue;
    }

    candidateDates.push(date);
    const amount = getSignedTransactionAmount(transaction);

    addEvent(eventsByDate, date, {
      type: 'transaction',
      cashAmount: amount,
      netDepositAmount: getNetDepositAmount(transaction),
    });
  }

  for (const dividend of dividends) {
    const date = toDateKey(dividend.paid_on);
    const amount = Number(dividend.amount ?? 0);

    if (!date || !Number.isFinite(amount)) {
      continue;
    }

    candidateDates.push(date);
    addEvent(eventsByDate, date, {
      type: 'dividend',
      cashAmount: amount,
    });
  }

  for (const order of orders) {
    const date = getOrderDate(order);
    const quantity = getOrderQuantity(order);
    const cashAmount = getOrderCashAmount(order);

    if (!date || !order.ticker || quantity === 0) {
      continue;
    }

    candidateDates.push(date);
    addEvent(eventsByDate, date, {
      type: 'order',
      ticker: order.ticker,
      quantity,
      cashAmount: Number.isFinite(cashAmount) ? cashAmount : 0,
    });
  }

  return {
    eventsByDate,
    startDate: candidateDates.sort()[0] ?? null,
  };
}

function buildImportedExportEvents({
  exportRows,
  apiOrders,
  apiDividends,
  apiTransactions,
  anchor,
  lookup,
}) {
  const eventsByDate = new Map();
  const candidateDates = [];
  const instrumentsByKey = new Map();
  let baseNetDepositsToAnchor = 0;

  function recordDate(date) {
    if (date) {
      candidateDates.push(date);
    }
  }

  function addNetDepositForAnchor(date, amount) {
    if (
      anchor?.date
      && date
      && date <= anchor.date
      && Number.isFinite(amount)
    ) {
      baseNetDepositsToAnchor += amount;
    }
  }

  for (const row of exportRows) {
    const date = toDateKey(row.date_time);
    if (!date) {
      continue;
    }

    recordDate(date);

    if (isExportBuyAction(row.action) || isExportSellAction(row.action)) {
      const quantity = getExportTradeQuantity(row);
      const cashAmount = getExportTradeCashAmount(row);
      const info = getExportInstrumentInfo(row, lookup);

      addInstrumentInfo(instrumentsByKey, info);

      if (info?.key && quantity !== 0) {
        addEvent(eventsByDate, date, {
          type: 'order',
          key: info.key,
          quantity,
          cashAmount,
        });
      }
      continue;
    }

    const cashAmount = getExportCashAmount(row);
    const netDepositAmount = getExportNetDepositAmount(row);
    addNetDepositForAnchor(date, netDepositAmount);

    if (cashAmount !== 0 || netDepositAmount !== 0) {
      addEvent(eventsByDate, date, {
        type: 'cash',
        cashAmount,
        netDepositAmount,
      });
    }
  }

  for (const transaction of apiTransactions) {
    const date = toDateKey(transaction.date_time);
    if (!date) {
      continue;
    }

    recordDate(date);
    const cashAmount = getSignedTransactionAmount(transaction);
    const netDepositAmount = getNetDepositAmount(transaction);
    addNetDepositForAnchor(date, netDepositAmount);
    addEvent(eventsByDate, date, {
      type: 'cash',
      cashAmount,
      netDepositAmount,
    });
  }

  for (const dividend of apiDividends) {
    const date = toDateKey(dividend.paid_on);
    const cashAmount = Number(dividend.amount ?? 0);

    if (!date || !Number.isFinite(cashAmount) || cashAmount === 0) {
      continue;
    }

    recordDate(date);
    addEvent(eventsByDate, date, {
      type: 'cash',
      cashAmount,
      netDepositAmount: 0,
    });
  }

  for (const order of apiOrders) {
    const date = getOrderDate(order);
    const quantity = getOrderQuantity(order);
    const cashAmount = getOrderCashAmount(order);
    const key = getInstrumentKeyFromParts(order.instrument_isin, order.ticker);
    const isSplitOrder = order.fill_type === 'STOCK_SPLIT';

    if (!date || !key || quantity === 0) {
      continue;
    }

    recordDate(date);
    addInstrumentInfo(instrumentsByKey, {
      key,
      isin: order.instrument_isin || null,
      t212Ticker: order.ticker,
      rawTicker: order.ticker,
      name: order.instrument_name || order.ticker,
      priceCurrency: order.instrument_currency || null,
    });

    if (isSplitOrder) {
      continue;
    }

    addEvent(eventsByDate, date, {
      type: 'order',
      key,
      quantity,
      cashAmount,
    });
  }

  const startDate = candidateDates.sort()[0] ?? null;
  let netDepositReconciliationAdjustment = 0;
  if (anchor?.date && Number.isFinite(anchor.value)) {
    netDepositReconciliationAdjustment = roundMoney(anchor.value - baseNetDepositsToAnchor);
    if (startDate && Math.abs(netDepositReconciliationAdjustment) > NET_DEPOSITS_TOLERANCE) {
      addEvent(eventsByDate, startDate, {
        type: 'cash',
        cashAmount: netDepositReconciliationAdjustment,
        netDepositAmount: netDepositReconciliationAdjustment,
        reconciliation: true,
      });
    }
  }

  return {
    baseNetDepositsToAnchor: roundMoney(baseNetDepositsToAnchor),
    eventsByDate,
    instrumentsByKey,
    netDepositReconciliationAdjustment,
    startDate,
  };
}

function applyImportedEvents(date, events, state, marketData) {
  for (const event of events) {
    if (Number.isFinite(event.cashAmount)) {
      state.cash += event.cashAmount;
    }

    if (Number.isFinite(event.netDepositAmount)) {
      state.netDeposits += event.netDepositAmount;
    }

    if (event.type === 'order' && event.key) {
      const priceSeries = marketData.pricesByKey.get(event.key);
      const quantity = adjustQuantityForPriceBasis(event.quantity, date, priceSeries);
      state.holdings.set(event.key, (state.holdings.get(event.key) || 0) + quantity);
    }
  }
}

function applySplitEvents(date, state, marketData) {
  for (const [key, priceSeries] of marketData.pricesByKey.entries()) {
    if (priceSeries.pricesAreSplitAdjusted) {
      continue;
    }

    const factor = priceSeries.splitsByDate?.get(date);

    if (!Number.isFinite(factor) || factor === 0 || factor === 1 || !state.holdings.has(key)) {
      continue;
    }

    state.holdings.set(key, state.holdings.get(key) * factor);
  }
}

function calculateImportedMarketValue(date, state, marketData, accountCurrency) {
  let marketValue = 0;

  for (const [key, quantity] of state.holdings.entries()) {
    if (Math.abs(quantity) < HOLDING_QUANTITY_TOLERANCE) {
      continue;
    }

    const priceSeries = marketData.pricesByKey.get(key);
    if (!priceSeries) {
      state.partial = true;
      state.missingSymbols.add(key);
      continue;
    }

    if (priceSeries.pricesByDate.has(date) && isValidMarketPrice(priceSeries.pricesByDate.get(date))) {
      state.lastPrices.set(key, priceSeries.pricesByDate.get(date));
    }

    let selectedPrice = getLastKnownValue(priceSeries.pricesByDate, date, state.lastPrices.get(key));
    if (isValidMarketPrice(selectedPrice)) {
      state.lastPrices.set(key, selectedPrice);
    }

    if (!isValidMarketPrice(selectedPrice)) {
      if (priceSeries.fallbackPricesByDate?.has(date) && isValidMarketPrice(priceSeries.fallbackPricesByDate.get(date))) {
        state.lastFallbackPrices.set(key, priceSeries.fallbackPricesByDate.get(date));
      }

      selectedPrice = getLastKnownValue(
        priceSeries.fallbackPricesByDate || new Map(),
        date,
        state.lastFallbackPrices.get(key)
      );

      if (isValidMarketPrice(selectedPrice)) {
        state.lastFallbackPrices.set(key, selectedPrice);
        state.partial = true;
        state.estimatedSymbols.add(priceSeries.ticker || key);
      }
    }

    if (!isValidMarketPrice(selectedPrice)) {
      state.partial = true;
      state.missingSymbols.add(priceSeries.ticker || key);
      continue;
    }

    let fxRate = 1;
    if (priceSeries.currency && priceSeries.currency !== accountCurrency) {
      const fxSeries = marketData.fxByCurrency.get(priceSeries.currency);
      if (!fxSeries) {
        state.partial = true;
        state.missingSymbols.add(`${priceSeries.currency}${accountCurrency}=X`);
        continue;
      }

      const fxKey = `${priceSeries.currency}:${accountCurrency}`;
      state.lastFxRates.set(fxKey, getLastKnownValue(fxSeries, date, state.lastFxRates.get(fxKey)));
      fxRate = state.lastFxRates.get(fxKey);

      if (!isValidMarketPrice(fxRate)) {
        state.partial = true;
        state.missingSymbols.add(`${priceSeries.currency}${accountCurrency}=X`);
        continue;
      }
    }

    marketValue += quantity * selectedPrice * fxRate;
  }

  return marketValue;
}

async function fetchMarketData(tickers, orders, startDate, endDate, accountCurrency) {
  const pricesByTicker = new Map();
  const missingSymbols = [];
  const estimatedSymbols = [];
  const historicalPriceSymbols = [];
  const currencies = new Set();
  const fallbackPricesByTicker = buildFillPriceSeriesByTicker(orders);

  for (const ticker of tickers) {
    try {
      const priceSeries = await buildPriceSeries(
        ticker,
        startDate,
        endDate,
        accountCurrency,
        fallbackPricesByTicker.get(ticker) || new Map()
      );
      pricesByTicker.set(ticker, priceSeries);

      if (priceSeries.currency && priceSeries.currency !== accountCurrency) {
        currencies.add(priceSeries.currency);
      }

      if (priceSeries.estimatedFromFillsOnly) {
        estimatedSymbols.push(ticker);
        warnPriceIssueOnce(
          `fill-fallback:${ticker}`,
          `[TotalReturn] Using fill-price fallback for ${ticker}; Yahoo prices unavailable (${priceSeries.failureMessage})`
        );
      }

      if (priceSeries.historicalFromCache) {
        historicalPriceSymbols.push(ticker);
      }
    } catch (err) {
      warnPriceIssueOnce(
        `missing:${ticker}`,
        `[TotalReturn] No usable price history for ${ticker}; excluding it while held (${err.message})`
      );
      missingSymbols.push(ticker);
    }
  }

  const fxByCurrency = new Map();
  for (const currency of currencies) {
    try {
      fxByCurrency.set(currency, await buildFxSeries(currency, accountCurrency, startDate, endDate));
    } catch (err) {
      const symbol = `${currency}${accountCurrency}=X`;
      console.warn(`[TotalReturn] Failed to fetch FX prices for ${symbol}:`, err.message);
      missingSymbols.push(symbol);
    }
  }

  return {
    estimatedSymbols,
    pricesByTicker,
    fxByCurrency,
    historicalPriceSymbols,
    missingSymbols,
  };
}

function applyEvents(events, state) {
  for (const event of events) {
    if (Number.isFinite(event.cashAmount)) {
      state.cash += event.cashAmount;
    }

    if (Number.isFinite(event.netDepositAmount)) {
      state.netDeposits += event.netDepositAmount;
    }

    if (event.type === 'order' && event.ticker) {
      state.holdings.set(event.ticker, (state.holdings.get(event.ticker) || 0) + event.quantity);
    }
  }
}

function calculateMarketValue(date, state, marketData, accountCurrency) {
  let marketValue = 0;

  for (const [ticker, quantity] of state.holdings.entries()) {
    if (Math.abs(quantity) < 0.0000001) {
      continue;
    }

    const priceSeries = marketData.pricesByTicker.get(ticker);
    if (!priceSeries) {
      state.partial = true;
      state.missingSymbols.add(ticker);
      continue;
    }

    if (priceSeries.pricesByDate.has(date) && isValidMarketPrice(priceSeries.pricesByDate.get(date))) {
      state.lastPrices.set(ticker, priceSeries.pricesByDate.get(date));
    }

    let selectedPrice = getLastKnownValue(priceSeries.pricesByDate, date, state.lastPrices.get(ticker));
    if (isValidMarketPrice(selectedPrice)) {
      state.lastPrices.set(ticker, selectedPrice);
    }

    if (!isValidMarketPrice(selectedPrice)) {
      if (priceSeries.fallbackPricesByDate?.has(date) && isValidMarketPrice(priceSeries.fallbackPricesByDate.get(date))) {
        state.lastFallbackPrices.set(ticker, priceSeries.fallbackPricesByDate.get(date));
      }

      selectedPrice = getLastKnownValue(
        priceSeries.fallbackPricesByDate || new Map(),
        date,
        state.lastFallbackPrices.get(ticker)
      );

      if (isValidMarketPrice(selectedPrice)) {
        state.lastFallbackPrices.set(ticker, selectedPrice);
        state.partial = true;
        state.estimatedSymbols.add(ticker);
      }
    }

    if (!isValidMarketPrice(selectedPrice)) {
      state.partial = true;
      state.missingSymbols.add(ticker);
      continue;
    }

    let fxRate = 1;
    if (priceSeries.currency && priceSeries.currency !== accountCurrency) {
      const fxSeries = marketData.fxByCurrency.get(priceSeries.currency);
      if (!fxSeries) {
        state.partial = true;
        state.missingSymbols.add(`${priceSeries.currency}${accountCurrency}=X`);
        continue;
      }

      const fxKey = `${priceSeries.currency}:${accountCurrency}`;
      state.lastFxRates.set(fxKey, getLastKnownValue(fxSeries, date, state.lastFxRates.get(fxKey)));
      fxRate = state.lastFxRates.get(fxKey);

      if (!isValidMarketPrice(fxRate)) {
        state.partial = true;
        state.missingSymbols.add(`${priceSeries.currency}${accountCurrency}=X`);
        continue;
      }
    }

    marketValue += quantity * selectedPrice * fxRate;
  }

  return marketValue;
}

async function buildImportedTotalReturnHistory({
  accountCurrency,
  dividends,
  exportRows,
  instruments,
  orders,
  positions,
  skipReconciliation = false,
  summary,
  transactions,
}) {
  const exportEarliestDateTime = getSyncState('t212_export_earliest_date_time')
    || exportRows[0]?.date_time
    || null;
  const exportLatestDateTime = getSyncState('t212_export_latest_date_time')
    || exportRows[exportRows.length - 1]?.date_time
    || null;
  const anchorValue = Number(getSyncState('t212_export_net_deposits_anchor'));
  const anchorDate = getSyncState('t212_export_net_deposits_anchor_date');
  const anchor = Number.isFinite(anchorValue) && anchorDate
    ? { value: anchorValue, date: anchorDate }
    : null;
  const lookup = buildInstrumentLookup({ instruments, orders, positions });
  const apiOrdersAfterExport = exportLatestDateTime
    ? orders.filter((order) => {
      const date = order.fill_filled_at || order.order_created_at;
      return date && date > exportLatestDateTime;
    })
    : [];
  const apiDividendsAfterExport = exportLatestDateTime
    ? dividends.filter((dividend) => dividend.paid_on && dividend.paid_on > exportLatestDateTime)
    : [];
  const apiTransactionsAfterExport = exportLatestDateTime
    ? transactions.filter((transaction) => transaction.date_time && transaction.date_time > exportLatestDateTime)
    : [];

  if (!anchor) {
    return {
      currency: accountCurrency,
      estimated: true,
      partial: true,
      missingSymbols: [],
      points: [],
      unavailableReason: 'Total return history is unavailable because no Trading 212 net-deposits anchor has been imported.',
      diagnostics: {
        exportEarliestDate: toDateKey(exportEarliestDateTime),
        exportLatestDate: toDateKey(exportLatestDateTime),
        exportRowCount: exportRows.length,
      },
    };
  }

  const {
    baseNetDepositsToAnchor,
    eventsByDate,
    instrumentsByKey,
    netDepositReconciliationAdjustment,
    startDate,
  } = buildImportedExportEvents({
    anchor,
    apiDividends: apiDividendsAfterExport,
    apiOrders: apiOrdersAfterExport,
    apiTransactions: apiTransactionsAfterExport,
    exportRows,
    lookup,
  });
  const endDate = new Date().toISOString().slice(0, 10);

  if (!startDate) {
    return {
      currency: accountCurrency,
      estimated: true,
      partial: false,
      missingSymbols: [],
      points: [],
      unavailableReason: 'No usable Trading 212 export rows were found.',
    };
  }

  const marketData = await fetchExportMarketData(
    instrumentsByKey,
    exportRows,
    apiOrdersAfterExport,
    startDate,
    endDate,
    accountCurrency,
    lookup
  );
  const summaryTotalValue = Number(summary?.total_value);
  const summaryInvestCurrentValue = Number(summary?.invest_current_value);
  const summaryUnrealisedPl = Number(summary?.invest_unrealized_pl);
  const state = {
    cash: 0,
    holdings: new Map(),
    lastFallbackPrices: new Map(),
    lastFxRates: new Map(),
    lastPrices: new Map(),
    missingSymbols: new Set(marketData.missingSymbols),
    netDeposits: 0,
    partial: (
      marketData.estimatedSymbols.length > 0
      || marketData.historicalPriceSymbols.length > 0
      || marketData.missingSymbols.length > 0
    ),
    estimatedSymbols: new Set(marketData.estimatedSymbols),
  };

  const points = [];
  let latestCash = 0;
  let latestMarketValue = 0;
  let latestRawTotalValue = 0;
  let marketValueReconciliationAdjustment = 0;
  for (const date of buildDateRange(startDate, endDate)) {
    applySplitEvents(date, state, marketData);
    applyImportedEvents(date, eventsByDate.get(date) ?? [], state, marketData);
    const marketValue = calculateImportedMarketValue(date, state, marketData, accountCurrency);
    latestCash = state.cash;
    latestMarketValue = marketValue;
    const rawTotalValue = state.cash + marketValue;
    latestRawTotalValue = rawTotalValue;
    const returnValue = rawTotalValue - state.netDeposits;
    const returnPct = state.netDeposits > 0 ? (returnValue / state.netDeposits) * 100 : null;

    points.push({
      date,
      totalValue: roundMoney(rawTotalValue),
      netDeposits: roundMoney(state.netDeposits),
      returnValue: roundMoney(returnValue),
      returnPct: Number.isFinite(returnPct) ? Math.round(returnPct * 100) / 100 : null,
    });
  }

  if (Number.isFinite(summaryTotalValue)) {
    marketValueReconciliationAdjustment = summaryTotalValue - latestRawTotalValue;
  }

  const finalPoint = points[points.length - 1];
  const reconstructedLatestValue = Number(finalPoint?.totalValue);
  const reconstructedUnrealisedPl = positions.reduce(
    (sum, position) => sum + (Number(position.wallet_unrealized_pl) || 0),
    0
  );
  const currentPositionsValue = positions.reduce(
    (sum, position) => sum + (Number(position.wallet_current_value) || 0),
    0
  );
  const deltaPercent = getSummaryDeltaPercent(reconstructedLatestValue, summaryTotalValue);
  // state.holdings is keyed by instrument key (`isin:XXX` / `ticker:XXX`).
  // T212 renames tickers over time but keeps ISINs stable (e.g. 1YDd_EQ →
  // AVGO_US_EQ), so resolve each holding to the ticker used in the current
  // positions table by matching ISIN first. Without this, renames produce
  // phantom stale+mismatched pairs in the diagnostic.
  const positionsByIsin = new Map();
  for (const position of positions) {
    if (position.instrument_isin) {
      positionsByIsin.set(position.instrument_isin, position);
    }
  }
  const holdingsByTicker = new Map();
  for (const [key, qty] of state.holdings.entries()) {
    const info = instrumentsByKey.get(key);
    const isin = info?.isin || (key.startsWith('isin:') ? key.slice(5) : null);
    const canonicalPosition = isin ? positionsByIsin.get(isin) : null;
    const ticker = canonicalPosition?.ticker
      || info?.t212Ticker
      || (key.startsWith('ticker:') ? key.slice(7) : null);
    if (!ticker) continue;
    holdingsByTicker.set(ticker, (holdingsByTicker.get(ticker) || 0) + qty);
  }
  const holdingDiagnostics = buildHoldingDiagnostics(holdingsByTicker, positions);
  const positionValueDelta = Number.isFinite(summaryInvestCurrentValue)
    ? Math.abs(currentPositionsValue - summaryInvestCurrentValue)
    : null;
  const unrealisedPlDelta = Number.isFinite(summaryUnrealisedPl)
    ? Math.abs(reconstructedUnrealisedPl - summaryUnrealisedPl)
    : null;
  const netDepositsDelta = Number.isFinite(Number(finalPoint?.netDeposits))
    ? Math.abs(Number(finalPoint.netDeposits) - anchor.value)
    : null;
  const failures = [];

  if (deltaPercent === null || deltaPercent > SUMMARY_RECONCILIATION_TOLERANCE_PCT) {
    failures.push('the latest reconstructed value is more than 2% away from the Trading 212 account summary');
  }

  if (positionValueDelta === null || positionValueDelta > FACE_VALUE_TOLERANCE) {
    failures.push('current position values do not match the Trading 212 investment current value');
  }

  if (unrealisedPlDelta === null || unrealisedPlDelta > FACE_VALUE_TOLERANCE) {
    failures.push('current unrealised P/L does not match the Trading 212 summary');
  }

  if (netDepositsDelta === null || netDepositsDelta > NET_DEPOSITS_TOLERANCE) {
    failures.push('latest net deposits do not match the Trading 212 net-deposits anchor');
  }

  const diagnostics = {
    currentPositionsValue: roundMoney(currentPositionsValue),
    currentSummaryValue: Number.isFinite(summaryTotalValue) ? roundMoney(summaryTotalValue) : null,
    deltaPercent: deltaPercent === null ? null : Math.round(deltaPercent * 100) / 100,
    exportEarliestDate: toDateKey(exportEarliestDateTime),
    exportLatestDate: toDateKey(exportLatestDateTime),
    exportRowCount: exportRows.length,
    importedApiOrderCountAfterExport: apiOrdersAfterExport.length,
    importedApiTransactionCountAfterExport: apiTransactionsAfterExport.length,
    marketValueReconciliationAdjustment: roundMoney(marketValueReconciliationAdjustment),
    netDepositReconciliationAdjustment,
    netDepositsAnchor: anchor.value,
    netDepositsAnchorDate: anchor.date,
    netDepositsBeforeReconciliation: baseNetDepositsToAnchor,
    rawReconstructedLatestValue: roundMoney(latestRawTotalValue),
    rawReconstructedLatestValueDeltaPercent: getSummaryDeltaPercent(latestRawTotalValue, summaryTotalValue) === null
      ? null
      : Math.round(getSummaryDeltaPercent(latestRawTotalValue, summaryTotalValue) * 100) / 100,
    reconstructedCash: roundMoney(latestCash),
    positionValueDelta: positionValueDelta === null ? null : roundMoney(positionValueDelta),
    reconstructedLatestValue: Number.isFinite(reconstructedLatestValue) ? roundMoney(reconstructedLatestValue) : null,
    reconstructedMarketValue: roundMoney(latestMarketValue),
    reconstructedUnrealisedPl: roundMoney(reconstructedUnrealisedPl),
    summaryInvestCurrentValue: Number.isFinite(summaryInvestCurrentValue) ? roundMoney(summaryInvestCurrentValue) : null,
    summaryUnrealisedPl: Number.isFinite(summaryUnrealisedPl) ? roundMoney(summaryUnrealisedPl) : null,
    unrealisedPlDelta: unrealisedPlDelta === null ? null : roundMoney(unrealisedPlDelta),
    staleHoldingCount: holdingDiagnostics.staleHoldingCount,
    mismatchedHoldingCount: holdingDiagnostics.mismatchedHoldingCount,
    staleHoldings: holdingDiagnostics.staleHoldings,
    mismatchedHoldings: holdingDiagnostics.mismatchedHoldings,
    suspiciousValueDrops: skipReconciliation ? buildSuspiciousValueDrops(points) : [],
  };
  const unavailableReason = buildExportUnavailableReason(failures);

  if (!skipReconciliation && unavailableReason) {
    return {
      currency: accountCurrency,
      diagnostics,
      estimated: true,
      estimatedSymbols: [...state.estimatedSymbols].sort(),
      historicalPriceSymbols: [...marketData.historicalPriceSymbols].sort(),
      missingSymbols: [...state.missingSymbols].sort(),
      partial: true,
      points: [],
      unavailableReason,
    };
  }

  if (!skipReconciliation && finalPoint && Number.isFinite(summaryTotalValue)) {
    finalPoint.totalValue = roundMoney(summaryTotalValue);
    finalPoint.netDeposits = roundMoney(anchor.value);
    finalPoint.returnValue = roundMoney(finalPoint.totalValue - finalPoint.netDeposits);
    finalPoint.returnPct = finalPoint.netDeposits > 0
      ? Math.round((finalPoint.returnValue / finalPoint.netDeposits) * 10000) / 100
      : null;
  }

  return {
    currency: accountCurrency,
    diagnostics,
    estimated: true,
    estimatedSymbols: [...state.estimatedSymbols].sort(),
    historicalPriceSymbols: [...marketData.historicalPriceSymbols].sort(),
    missingSymbols: [...state.missingSymbols].sort(),
    partial: state.partial,
    points,
    unavailableReason: skipReconciliation ? unavailableReason : undefined,
  };
}

async function buildTotalReturnHistory({ skipReconciliation = false } = {}) {
  const summary = db.prepare('SELECT * FROM account_summary WHERE id = 1').get();
  const accountCurrency = summary?.currency || 'GBP';
  const exportRows = db.prepare('SELECT * FROM t212_export_rows ORDER BY date_time ASC, row_index ASC').all();
  const transactions = db.prepare('SELECT * FROM transactions ORDER BY date_time ASC').all();
  const orders = db.prepare(`
    SELECT * FROM orders
    WHERE status = 'FILLED'
      AND ticker IS NOT NULL
      AND (fill_quantity IS NOT NULL OR order_filled_quantity IS NOT NULL)
    ORDER BY COALESCE(fill_filled_at, order_created_at) ASC
  `).all();
  const dividends = db.prepare('SELECT * FROM dividends ORDER BY paid_on ASC').all();
  const positions = db.prepare('SELECT * FROM positions ORDER BY ticker ASC').all();
  const instruments = db.prepare('SELECT * FROM instruments ORDER BY ticker ASC').all();

  // Use the import path whenever we have export rows — it covers stock splits,
  // share-based dividends, and the full deposit history (none of which the API
  // orders/transactions endpoints expose). When skipReconciliation is set, the
  // imported path also bypasses its own validation gate and final-point anchor.
  if (exportRows.length > 0) {
    return buildImportedTotalReturnHistory({
      accountCurrency,
      dividends,
      exportRows,
      instruments,
      orders,
      positions,
      skipReconciliation,
      summary,
      transactions,
    });
  }

  const hasAnyDepositSource = transactions.length > 0
    || (skipReconciliation && exportRows.some(
      (row) => row.action === 'Deposit' || row.action === 'Withdrawal'
    ));

  if (!hasAnyDepositSource || orders.length === 0) {
    return {
      currency: accountCurrency,
      estimated: true,
      partial: !hasAnyDepositSource || orders.length === 0,
      missingSymbols: [],
      points: [],
      unavailableReason: 'No usable transaction and order history yet.',
    };
  }

  const earliestTransactionDate = getEarliestDate(transactions, (transaction) => toDateKey(transaction.date_time));
  const earliestOrderDate = getEarliestDate(orders, getOrderDate);
  const { eventsByDate, startDate } = buildEvents({
    transactions,
    orders,
    dividends,
    depositFillRows: skipReconciliation ? exportRows : [],
  });
  const endDate = new Date().toISOString().slice(0, 10);

  if (!startDate) {
    return {
      currency: accountCurrency,
      estimated: true,
      partial: false,
      missingSymbols: [],
      points: [],
    };
  }

  const tickers = [...new Set(orders.map((order) => order.ticker).filter(Boolean))];
  const marketData = await fetchMarketData(tickers, orders, startDate, endDate, accountCurrency);
  const state = {
    cash: 0,
    netDeposits: 0,
    holdings: new Map(),
    lastPrices: new Map(),
    lastFallbackPrices: new Map(),
    lastFxRates: new Map(),
    estimatedSymbols: new Set(marketData.estimatedSymbols),
    missingSymbols: new Set(marketData.missingSymbols),
    partial: (
      marketData.estimatedSymbols.length > 0
      || marketData.historicalPriceSymbols.length > 0
      || marketData.missingSymbols.length > 0
    ),
  };

  const points = [];
  for (const date of buildDateRange(startDate, endDate)) {
    applyEvents(eventsByDate.get(date) ?? [], state);
    const marketValue = calculateMarketValue(date, state, marketData, accountCurrency);
    const totalValue = state.cash + marketValue;
    const returnValue = totalValue - state.netDeposits;
    const returnPct = state.netDeposits > 0 ? (returnValue / state.netDeposits) * 100 : null;

    points.push({
      date,
      totalValue: roundMoney(totalValue),
      netDeposits: roundMoney(state.netDeposits),
      returnValue: roundMoney(returnValue),
      returnPct: Number.isFinite(returnPct) ? Math.round(returnPct * 100) / 100 : null,
    });
  }

  const finalPoint = points[points.length - 1];
  const summaryTotalValue = Number(summary?.total_value);
  const reconstructedLatestValue = Number(finalPoint?.totalValue);
  const deltaPercent = getSummaryDeltaPercent(reconstructedLatestValue, summaryTotalValue);
  const holdingDiagnostics = buildHoldingDiagnostics(state.holdings, positions);
  const transactionHistoryIncomplete = Boolean(
    earliestTransactionDate && earliestOrderDate && earliestTransactionDate > earliestOrderDate
  );
  const holdingsUnreconciled = (
    holdingDiagnostics.staleHoldingCount > 0
    || holdingDiagnostics.mismatchedHoldingCount > 0
  );
  const latestValueOutsideTolerance = (
    deltaPercent === null
    || deltaPercent > SUMMARY_RECONCILIATION_TOLERANCE_PCT
  );
  const unavailableReason = buildUnavailableReason({
    transactionHistoryIncomplete,
    holdingsUnreconciled,
    latestValueOutsideTolerance,
  });
  const diagnostics = {
    currentSummaryValue: Number.isFinite(summaryTotalValue) ? roundMoney(summaryTotalValue) : null,
    reconstructedLatestValue: Number.isFinite(reconstructedLatestValue) ? roundMoney(reconstructedLatestValue) : null,
    deltaPercent: deltaPercent === null ? null : Math.round(deltaPercent * 100) / 100,
    tolerancePercent: SUMMARY_RECONCILIATION_TOLERANCE_PCT,
    earliestOrderDate,
    earliestTransactionDate,
    staleHoldingCount: holdingDiagnostics.staleHoldingCount,
    mismatchedHoldingCount: holdingDiagnostics.mismatchedHoldingCount,
    staleHoldings: holdingDiagnostics.staleHoldings,
    mismatchedHoldings: holdingDiagnostics.mismatchedHoldings,
    transactionCount: transactions.length,
    orderCount: orders.length,
    suspiciousValueDrops: skipReconciliation ? buildSuspiciousValueDrops(points) : [],
  };

  if (!skipReconciliation && unavailableReason) {
    return {
      currency: accountCurrency,
      estimated: true,
      partial: true,
      estimatedSymbols: [...state.estimatedSymbols].sort(),
      historicalPriceSymbols: [...marketData.historicalPriceSymbols].sort(),
      missingSymbols: [...state.missingSymbols].sort(),
      points: [],
      unavailableReason,
      diagnostics,
    };
  }

  if (!skipReconciliation && finalPoint && Number.isFinite(summaryTotalValue)) {
    finalPoint.totalValue = roundMoney(summary.total_value);
    finalPoint.returnValue = roundMoney(finalPoint.totalValue - finalPoint.netDeposits);
    finalPoint.returnPct = finalPoint.netDeposits > 0
      ? Math.round((finalPoint.returnValue / finalPoint.netDeposits) * 10000) / 100
      : null;
  }

  return {
    currency: accountCurrency,
    estimated: true,
    partial: state.partial,
    estimatedSymbols: [...state.estimatedSymbols].sort(),
    historicalPriceSymbols: [...marketData.historicalPriceSymbols].sort(),
    missingSymbols: [...state.missingSymbols].sort(),
    diagnostics,
    unavailableReason: skipReconciliation ? unavailableReason : undefined,
    points,
  };
}

module.exports = {
  buildTotalReturnHistory,
  __testing: {
    buildHoldingDiagnostics,
    getNetDepositAmount,
    getOrderCashAmount,
    getSignedTransactionAmount,
    getSummaryDeltaPercent,
  },
};
