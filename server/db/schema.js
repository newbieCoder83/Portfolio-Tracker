const db = require('./connection');

/**
 * Initialize all database tables.
 * Called once on server startup — safe to run multiple times (IF NOT EXISTS).
 */
function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key_enc TEXT NOT NULL,
      api_secret_enc TEXT NOT NULL,
      iv_key TEXT NOT NULL,
      iv_secret TEXT NOT NULL,
      auth_tag_key TEXT NOT NULL,
      auth_tag_secret TEXT NOT NULL,
      environment TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS account_summary (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      account_id INTEGER,
      currency TEXT,
      total_value REAL,
      cash_available_to_trade REAL,
      cash_in_pies REAL,
      cash_reserved_for_orders REAL,
      invest_current_value REAL,
      invest_total_cost REAL,
      invest_unrealized_pl REAL,
      invest_realized_pl REAL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS positions (
      ticker TEXT PRIMARY KEY,
      average_price_paid REAL,
      current_price REAL,
      quantity REAL,
      quantity_available_for_trading REAL,
      quantity_in_pies REAL,
      created_at TEXT,
      instrument_name TEXT,
      instrument_currency TEXT,
      instrument_isin TEXT,
      wallet_currency TEXT,
      wallet_current_value REAL,
      wallet_total_cost REAL,
      wallet_unrealized_pl REAL,
      wallet_fx_impact REAL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS instruments (
      ticker TEXT PRIMARY KEY,
      name TEXT,
      short_name TEXT,
      currency_code TEXT,
      isin TEXT,
      type TEXT,
      added_on TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dividends (
      reference TEXT PRIMARY KEY,
      ticker TEXT,
      amount REAL,
      amount_in_euro REAL,
      currency TEXT,
      gross_amount_per_share REAL,
      paid_on TEXT,
      quantity REAL,
      ticker_currency TEXT,
      type TEXT,
      instrument_name TEXT,
      instrument_currency TEXT,
      instrument_isin TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      order_id INTEGER PRIMARY KEY,
      ticker TEXT,
      side TEXT,
      status TEXT,
      type TEXT,
      strategy TEXT,
      order_currency TEXT,
      order_created_at TEXT,
      order_quantity REAL,
      order_filled_quantity REAL,
      order_filled_value REAL,
      order_limit_price REAL,
      order_stop_price REAL,
      order_value REAL,
      time_in_force TEXT,
      initiated_from TEXT,
      extended_hours INTEGER,
      instrument_name TEXT,
      instrument_currency TEXT,
      instrument_isin TEXT,
      fill_id INTEGER,
      fill_price REAL,
      fill_quantity REAL,
      fill_filled_at TEXT,
      fill_trading_method TEXT,
      fill_type TEXT,
      fill_wallet_currency TEXT,
      fill_wallet_fx_rate REAL,
      fill_wallet_net_value REAL,
      fill_wallet_realised_pl REAL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      reference TEXT PRIMARY KEY,
      amount REAL,
      currency TEXT,
      date_time TEXT,
      type TEXT
    );

    CREATE TABLE IF NOT EXISTS t212_export_rows (
      unique_key TEXT PRIMARY KEY,
      row_index INTEGER,
      action TEXT,
      date_time TEXT,
      isin TEXT,
      ticker TEXT,
      name TEXT,
      notes TEXT,
      export_id TEXT,
      shares REAL,
      price REAL,
      price_currency TEXT,
      exchange_rate REAL,
      result REAL,
      result_currency TEXT,
      total REAL,
      total_currency TEXT,
      withholding_tax REAL,
      withholding_tax_currency TEXT,
      stamp_duty_reserve_tax REAL,
      stamp_duty_reserve_tax_currency TEXT,
      currency_conversion_fee REAL,
      currency_conversion_fee_currency TEXT,
      finra_fee REAL,
      finra_fee_currency TEXT,
      french_transaction_tax REAL,
      french_transaction_tax_currency TEXT,
      transaction_fee REAL,
      transaction_fee_currency TEXT,
      record_date TEXT,
      total_ccy REAL,
      source_file TEXT,
      imported_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      date TEXT PRIMARY KEY,
      total_value REAL,
      invested REAL,
      cash REAL,
      unrealised_ppl REAL
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS corporate_actions (
      ticker TEXT NOT NULL,
      action_date TEXT NOT NULL,
      action_type TEXT NOT NULL,
      factor REAL NOT NULL,
      source TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (ticker, action_date, source)
    );
    CREATE INDEX IF NOT EXISTS idx_corporate_actions_ticker ON corporate_actions(ticker);

    CREATE TABLE IF NOT EXISTS historical_prices (
      instrument_key TEXT NOT NULL,
      ticker TEXT,
      isin TEXT,
      bar_date TEXT NOT NULL,
      close REAL NOT NULL,
      currency TEXT,
      source TEXT NOT NULL,
      source_symbol TEXT,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (instrument_key, bar_date, source)
    );
    CREATE INDEX IF NOT EXISTS idx_historical_prices_lookup
      ON historical_prices(instrument_key, bar_date);
    CREATE INDEX IF NOT EXISTS idx_historical_prices_ticker
      ON historical_prices(ticker, bar_date);
    CREATE INDEX IF NOT EXISTS idx_historical_prices_isin
      ON historical_prices(isin, bar_date);
  `);
}

module.exports = { initializeSchema };
