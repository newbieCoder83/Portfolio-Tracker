const db = require('../db/connection');
const T212Client = require('./t212Client');

/**
 * Full sync: fetches all data from T212 and stores in SQLite.
 * Used on first login or when user wants a complete refresh.
 */
async function fullSync(apiKey, apiSecret, environment) {
  const client = new T212Client(apiKey, apiSecret, environment);
  const counts = { positions: 0, dividends: 0, orders: 0, transactions: 0, instruments: 0 };

  // 1. Fetch and store account summary
  console.log('[Sync] Fetching account summary...');
  const summary = await client.get('/api/v0/equity/account/summary', 'summary');
  upsertAccountSummary(summary);

  // 2. Fetch and store positions (flat array, not paginated)
  console.log('[Sync] Fetching positions...');
  const positions = await client.get('/api/v0/equity/positions', 'positions');
  replacePositions(positions);
  counts.positions = positions.length;

  // 3. Fetch all dividends (paginated)
  console.log('[Sync] Fetching all dividends...');
  const dividends = await client.paginateAll(
    '/api/v0/equity/history/dividends?limit=50',
    'dividends'
  );
  upsertDividends(dividends);
  counts.dividends = dividends.length;

  // 4. Fetch all orders (paginated)
  console.log('[Sync] Fetching all orders...');
  const orders = await client.paginateAll(
    '/api/v0/equity/history/orders?limit=50',
    'orders'
  );
  upsertOrders(orders);
  counts.orders = orders.length;

  // 5. Fetch all cash transactions (paginated)
  console.log('[Sync] Fetching all transactions...');
  counts.transactions = await fetchAllTransactions(client);

  // 6. Fetch instruments metadata
  console.log('[Sync] Fetching instruments...');
  const instruments = await client.get('/api/v0/equity/metadata/instruments', 'instruments');
  upsertInstruments(instruments);
  counts.instruments = instruments.length;

  // 7. Create daily snapshot
  createDailySnapshot(summary);

  // 8. Update sync state
  setSyncState('last_full_sync', new Date().toISOString());
  setSyncState('last_sync', new Date().toISOString());
  setSyncState('instruments_last_sync', new Date().toISOString());

  console.log('[Sync] Full sync complete:', counts);
  return counts;
}

/**
 * Incremental sync: refreshes current state data and only fetches new history.
 */
async function incrementalSync(apiKey, apiSecret, environment) {
  const client = new T212Client(apiKey, apiSecret, environment);
  const counts = { positions: 0, dividends: 0, orders: 0, transactions: 0, instruments: 0 };

  // 1. Always refresh account summary
  console.log('[Sync] Refreshing account summary...');
  const summary = await client.get('/api/v0/equity/account/summary', 'summary');
  upsertAccountSummary(summary);

  // 2. Always refresh positions
  console.log('[Sync] Refreshing positions...');
  const positions = await client.get('/api/v0/equity/positions', 'positions');
  replacePositions(positions);
  counts.positions = positions.length;

  // 3. Fetch only new dividends (newer than last stored)
  console.log('[Sync] Fetching new dividends...');
  const newDividends = await fetchNewDividends(client);
  counts.dividends = newDividends;

  // 4. Fetch only new orders (newer than last stored)
  console.log('[Sync] Fetching new orders...');
  const newOrders = await fetchNewOrders(client);
  counts.orders = newOrders;

  // 5. Fetch only new transactions
  console.log('[Sync] Fetching new transactions...');
  counts.transactions = await fetchNewTransactions(client);

  // 6. Refresh instruments if stale (>24 hours)
  const instrumentsLastSync = getSyncState('instruments_last_sync');
  const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours
  if (!instrumentsLastSync || (Date.now() - new Date(instrumentsLastSync).getTime()) > staleThreshold) {
    console.log('[Sync] Refreshing instruments (stale)...');
    const instruments = await client.get('/api/v0/equity/metadata/instruments', 'instruments');
    upsertInstruments(instruments);
    counts.instruments = instruments.length;
    setSyncState('instruments_last_sync', new Date().toISOString());
  }

  // 7. Create daily snapshot
  createDailySnapshot(summary);

  // 8. Update sync state
  setSyncState('last_sync', new Date().toISOString());

  console.log('[Sync] Incremental sync complete:', counts);
  return counts;
}

// --- Database helpers ---

function upsertAccountSummary(data) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO account_summary
      (id, account_id, currency, total_value,
       cash_available_to_trade, cash_in_pies, cash_reserved_for_orders,
       invest_current_value, invest_total_cost, invest_unrealized_pl, invest_realized_pl,
       updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  stmt.run(
    data.id,
    data.currency,
    data.totalValue,
    data.cash.availableToTrade,
    data.cash.inPies,
    data.cash.reservedForOrders,
    data.investments.currentValue,
    data.investments.totalCost,
    data.investments.unrealizedProfitLoss,
    data.investments.realizedProfitLoss
  );
}

function replacePositions(positions) {
  // Clear old positions and insert fresh data
  const deleteStmt = db.prepare('DELETE FROM positions');
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO positions
      (ticker, average_price_paid, current_price, quantity,
       quantity_available_for_trading, quantity_in_pies, created_at,
       instrument_name, instrument_currency, instrument_isin,
       wallet_currency, wallet_current_value, wallet_total_cost,
       wallet_unrealized_pl, wallet_fx_impact, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const transaction = db.transaction((items) => {
    deleteStmt.run();
    for (const p of items) {
      insertStmt.run(
        p.instrument.ticker,
        p.averagePricePaid,
        p.currentPrice,
        p.quantity,
        p.quantityAvailableForTrading,
        p.quantityInPies,
        p.createdAt,
        p.instrument.name,
        p.instrument.currency,
        p.instrument.isin,
        p.walletImpact.currency,
        p.walletImpact.currentValue,
        p.walletImpact.totalCost,
        p.walletImpact.unrealizedProfitLoss,
        p.walletImpact.fxImpact
      );
    }
  });

  transaction(positions);
}

function upsertDividends(dividends) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO dividends
      (reference, ticker, amount, amount_in_euro, currency,
       gross_amount_per_share, paid_on, quantity, ticker_currency, type,
       instrument_name, instrument_currency, instrument_isin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction((items) => {
    for (const d of items) {
      stmt.run(
        d.reference,
        d.ticker,
        d.amount,
        d.amountInEuro,
        d.currency,
        d.grossAmountPerShare,
        d.paidOn,
        d.quantity,
        d.tickerCurrency,
        d.type,
        d.instrument ? d.instrument.name : null,
        d.instrument ? d.instrument.currency : null,
        d.instrument ? d.instrument.isin : null
      );
    }
  });

  transaction(dividends);
}

function upsertOrders(orders) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO orders
      (order_id, ticker, side, status, type, strategy,
       order_currency, order_created_at, order_quantity,
       order_filled_quantity, order_filled_value,
       order_limit_price, order_stop_price, order_value,
       time_in_force, initiated_from, extended_hours,
       instrument_name, instrument_currency, instrument_isin,
       fill_id, fill_price, fill_quantity, fill_filled_at,
       fill_trading_method, fill_type,
       fill_wallet_currency, fill_wallet_fx_rate,
       fill_wallet_net_value, fill_wallet_realised_pl)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction((items) => {
    for (const item of items) {
      const o = item.order;
      const f = item.fill;
      stmt.run(
        o.id,
        o.ticker,
        o.side,
        o.status,
        o.type,
        o.strategy,
        o.currency,
        o.createdAt,
        o.quantity,
        o.filledQuantity,
        o.filledValue,
        o.limitPrice,
        o.stopPrice,
        o.value,
        o.timeInForce,
        o.initiatedFrom,
        o.extendedHours ? 1 : 0,
        o.instrument ? o.instrument.name : null,
        o.instrument ? o.instrument.currency : null,
        o.instrument ? o.instrument.isin : null,
        f ? f.id : null,
        f ? f.price : null,
        f ? f.quantity : null,
        f ? f.filledAt : null,
        f ? f.tradingMethod : null,
        f ? f.type : null,
        f && f.walletImpact ? f.walletImpact.currency : null,
        f && f.walletImpact ? f.walletImpact.fxRate : null,
        f && f.walletImpact ? f.walletImpact.netValue : null,
        f && f.walletImpact ? f.walletImpact.realisedProfitLoss : null
      );
    }
  });

  transaction(orders);
}

function upsertTransactions(transactions) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO transactions
      (reference, amount, currency, date_time, type)
    VALUES (?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction((items) => {
    for (const item of items) {
      if (!item.reference) {
        continue;
      }

      stmt.run(
        item.reference,
        item.amount,
        item.currency,
        item.dateTime,
        item.type
      );
    }
  });

  transaction(transactions);
}

function upsertInstruments(instruments) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO instruments
      (ticker, name, short_name, currency_code, isin, type, added_on, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const transaction = db.transaction((items) => {
    for (const i of items) {
      stmt.run(
        i.ticker,
        i.name,
        i.shortName,
        i.currencyCode,
        i.isin,
        i.type,
        i.addedOn
      );
    }
  });

  transaction(instruments);
}

function createDailySnapshot(summary) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const existing = db.prepare('SELECT date FROM snapshots WHERE date = ?').get(today);
  if (existing) {
    // Update today's snapshot with latest values
    db.prepare(`
      UPDATE snapshots SET total_value = ?, invested = ?, cash = ?, unrealised_ppl = ?
      WHERE date = ?
    `).run(
      summary.totalValue,
      summary.investments.totalCost,
      summary.cash.availableToTrade,
      summary.investments.unrealizedProfitLoss,
      today
    );
  } else {
    db.prepare(`
      INSERT INTO snapshots (date, total_value, invested, cash, unrealised_ppl)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      today,
      summary.totalValue,
      summary.investments.totalCost,
      summary.cash.availableToTrade,
      summary.investments.unrealizedProfitLoss
    );
  }
}

/**
 * Fetch only dividends newer than the most recent one in the DB.
 * Returns count of new dividends inserted.
 */
async function fetchNewDividends(client) {
  const latest = db.prepare('SELECT MAX(paid_on) as latest FROM dividends').get();
  let newCount = 0;

  // Paginate and stop when we hit records we already have
  let currentPath = '/api/v0/equity/history/dividends?limit=50';
  while (currentPath) {
    const data = await client.get(currentPath, 'dividends', false);
    if (!data.items || data.items.length === 0) break;

    // Filter to only new records
    const newItems = data.items.filter((d) => {
      // Check if we already have this record
      const exists = db.prepare('SELECT 1 FROM dividends WHERE reference = ?').get(d.reference);
      return !exists;
    });

    if (newItems.length > 0) {
      upsertDividends(newItems);
      newCount += newItems.length;
    }

    // If all items in this page already existed, stop paginating
    if (newItems.length === 0) break;

    if (data.nextPagePath && !data.nextPagePath.includes('null')) {
      currentPath = data.nextPagePath;
    } else {
      currentPath = null;
    }
  }

  return newCount;
}

/**
 * Fetch only orders newer than the most recent one in the DB.
 * Returns count of new orders inserted.
 */
async function fetchNewOrders(client) {
  let newCount = 0;
  let currentPath = '/api/v0/equity/history/orders?limit=50';

  while (currentPath) {
    const data = await client.get(currentPath, 'orders', false);
    if (!data.items || data.items.length === 0) break;

    const newItems = data.items.filter((item) => {
      const exists = db.prepare('SELECT 1 FROM orders WHERE order_id = ?').get(item.order.id);
      return !exists;
    });

    if (newItems.length > 0) {
      upsertOrders(newItems);
      newCount += newItems.length;
    }

    // If all items already existed, stop paginating
    if (newItems.length === 0) break;

    if (data.nextPagePath && !data.nextPagePath.includes('null')) {
      currentPath = data.nextPagePath;
    } else {
      currentPath = null;
    }
  }

  return newCount;
}

function isMissingTransactionsScopeError(err) {
  return err && err.response && err.response.status === 403;
}

async function fetchAllTransactions(client) {
  try {
    const transactions = await client.paginateAll(
      '/api/v0/equity/history/transactions?limit=50',
      'transactions'
    );
    upsertTransactions(transactions);
    setSyncState('transactions_sync_unavailable', 'false');
    return transactions.length;
  } catch (err) {
    if (isMissingTransactionsScopeError(err)) {
      console.warn('[Sync] Skipping transactions: API key is missing history:transactions scope');
      setSyncState('transactions_sync_unavailable', 'true');
      return 0;
    }

    throw err;
  }
}

async function fetchNewTransactions(client) {
  let newCount = 0;
  let currentPath = '/api/v0/equity/history/transactions?limit=50';

  try {
    while (currentPath) {
      const data = await client.get(currentPath, 'transactions', false);
      if (!data.items || data.items.length === 0) break;

      const newItems = data.items.filter((item) => {
        const exists = db.prepare('SELECT 1 FROM transactions WHERE reference = ?').get(item.reference);
        return !exists;
      });

      if (newItems.length > 0) {
        upsertTransactions(newItems);
        newCount += newItems.length;
      }

      if (newItems.length === 0) break;

      if (data.nextPagePath && !data.nextPagePath.includes('null')) {
        currentPath = data.nextPagePath;
      } else {
        currentPath = null;
      }
    }

    setSyncState('transactions_sync_unavailable', 'false');
    return newCount;
  } catch (err) {
    if (isMissingTransactionsScopeError(err)) {
      console.warn('[Sync] Skipping transactions: API key is missing history:transactions scope');
      setSyncState('transactions_sync_unavailable', 'true');
      return 0;
    }

    throw err;
  }
}

// --- Sync state helpers ---

function getSyncState(key) {
  const row = db.prepare('SELECT value FROM sync_state WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSyncState(key, value) {
  db.prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)').run(key, value);
}

module.exports = { fullSync, incrementalSync, getSyncState };
