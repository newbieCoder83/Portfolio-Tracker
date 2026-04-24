const crypto = require('crypto');
const path = require('path');
const XLSX = require('xlsx');
const db = require('../db/connection');
const { initializeSchema } = require('../db/schema');

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith('--')) {
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function asText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text === '' ? null : text;
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
}

function excelDateToIso(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  const serial = Number(value);
  if (!Number.isFinite(serial)) {
    return null;
  }

  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed) {
    return null;
  }

  const wholeSeconds = Math.floor(parsed.S);
  const milliseconds = Math.round((parsed.S - wholeSeconds) * 1000);
  return new Date(Date.UTC(
    parsed.y,
    parsed.m - 1,
    parsed.d,
    parsed.H,
    parsed.M,
    wholeSeconds,
    milliseconds
  )).toISOString();
}

function excelDateToDateKey(value) {
  const iso = excelDateToIso(value);
  return iso ? iso.slice(0, 10) : null;
}

function getCell(row, header) {
  return row[header];
}

function hashRow(row) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(row))
    .digest('hex');
}

function buildUniqueKey(row) {
  const exportId = asText(getCell(row, 'ID'));

  if (exportId) {
    return `id:${exportId}`;
  }

  return `hash:${hashRow(row)}`;
}

function setSyncState(key, value) {
  db.prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)').run(
    key,
    value === null || value === undefined ? null : String(value)
  );
}

function requireArg(args, name) {
  if (!args[name]) {
    throw new Error(`Missing required --${name} argument`);
  }

  return args[name];
}

function importRows({ file, netDepositsAnchor, anchorDate }) {
  initializeSchema();

  const sourceFile = path.resolve(file);
  const workbook = XLSX.readFile(sourceFile, { cellDates: false });
  const sheet = workbook.Sheets['All Transactions'];

  if (!sheet) {
    throw new Error('Could not find "All Transactions" sheet in workbook');
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO t212_export_rows (
      unique_key, row_index, action, date_time, isin, ticker, name, notes, export_id,
      shares, price, price_currency, exchange_rate, result, result_currency,
      total, total_currency, withholding_tax, withholding_tax_currency,
      stamp_duty_reserve_tax, stamp_duty_reserve_tax_currency,
      currency_conversion_fee, currency_conversion_fee_currency,
      finra_fee, finra_fee_currency, french_transaction_tax,
      french_transaction_tax_currency, transaction_fee, transaction_fee_currency,
      record_date, total_ccy, source_file
    )
    VALUES (
      @unique_key, @row_index, @action, @date_time, @isin, @ticker, @name, @notes, @export_id,
      @shares, @price, @price_currency, @exchange_rate, @result, @result_currency,
      @total, @total_currency, @withholding_tax, @withholding_tax_currency,
      @stamp_duty_reserve_tax, @stamp_duty_reserve_tax_currency,
      @currency_conversion_fee, @currency_conversion_fee_currency,
      @finra_fee, @finra_fee_currency, @french_transaction_tax,
      @french_transaction_tax_currency, @transaction_fee, @transaction_fee_currency,
      @record_date, @total_ccy, @source_file
    )
  `);

  let earliest = null;
  let latest = null;
  let workbookNetDeposits = 0;
  let imported = 0;
  const actionCounts = {};

  const transaction = db.transaction((items) => {
    for (let index = 0; index < items.length; index += 1) {
      const row = items[index];
      const action = asText(getCell(row, 'Action'));
      const dateTime = excelDateToIso(getCell(row, 'Time'));
      const total = asNumber(getCell(row, 'Total'));

      if (!action || !dateTime) {
        continue;
      }

      if (action === 'Deposit' || action === 'Withdrawal') {
        workbookNetDeposits += total || 0;
      }

      earliest = !earliest || dateTime < earliest ? dateTime : earliest;
      latest = !latest || dateTime > latest ? dateTime : latest;
      actionCounts[action] = (actionCounts[action] || 0) + 1;

      insertStmt.run({
        unique_key: buildUniqueKey(row),
        row_index: index + 2,
        action,
        date_time: dateTime,
        isin: asText(getCell(row, 'ISIN')),
        ticker: asText(getCell(row, 'Ticker')),
        name: asText(getCell(row, 'Name')),
        notes: asText(getCell(row, 'Notes')),
        export_id: asText(getCell(row, 'ID')),
        shares: asNumber(getCell(row, 'No. of shares')),
        price: asNumber(getCell(row, 'Price / share')),
        price_currency: asText(getCell(row, 'Currency (Price / share)')),
        exchange_rate: asNumber(getCell(row, 'Exchange rate')),
        result: asNumber(getCell(row, 'Result')),
        result_currency: asText(getCell(row, 'Currency (Result)')),
        total,
        total_currency: asText(getCell(row, 'Currency (Total)')),
        withholding_tax: asNumber(getCell(row, 'Withholding tax')),
        withholding_tax_currency: asText(getCell(row, 'Currency (Withholding tax)')),
        stamp_duty_reserve_tax: asNumber(getCell(row, 'Stamp duty reserve tax')),
        stamp_duty_reserve_tax_currency: asText(getCell(row, 'Currency (Stamp duty reserve tax)')),
        currency_conversion_fee: asNumber(getCell(row, 'Currency conversion fee')),
        currency_conversion_fee_currency: asText(getCell(row, 'Currency (Currency conversion fee)')),
        finra_fee: asNumber(getCell(row, 'Finra fee')),
        finra_fee_currency: asText(getCell(row, 'Currency (Finra fee)')),
        french_transaction_tax: asNumber(getCell(row, 'French transaction tax')),
        french_transaction_tax_currency: asText(getCell(row, 'Currency (French transaction tax)')),
        transaction_fee: asNumber(getCell(row, 'Transaction fee')),
        transaction_fee_currency: asText(getCell(row, 'Currency (Transaction fee)')),
        record_date: excelDateToDateKey(getCell(row, 'Record Date')),
        total_ccy: asNumber(getCell(row, 'Total (CCY)')),
        source_file: sourceFile,
      });

      imported += 1;
    }
  });

  transaction(rows);

  setSyncState('t212_export_net_deposits_anchor', netDepositsAnchor);
  setSyncState('t212_export_net_deposits_anchor_date', anchorDate);
  setSyncState('t212_export_net_deposits_anchor_source', sourceFile);
  setSyncState('t212_export_earliest_date_time', earliest);
  setSyncState('t212_export_latest_date_time', latest);
  setSyncState('t212_export_row_count', imported);
  setSyncState('t212_export_workbook_net_deposits', Math.round(workbookNetDeposits * 100) / 100);

  return {
    imported,
    earliest,
    latest,
    workbookNetDeposits: Math.round(workbookNetDeposits * 100) / 100,
    netDepositsAnchor,
    anchorDate,
    actionCounts,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = requireArg(args, 'file');
  const netDepositsAnchor = Number(requireArg(args, 'net-deposits'));
  const anchorDate = requireArg(args, 'anchor-date');

  if (!Number.isFinite(netDepositsAnchor)) {
    throw new Error('--net-deposits must be a number');
  }

  const result = importRows({ file, netDepositsAnchor, anchorDate });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`[ImportT212Export] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { importRows };
