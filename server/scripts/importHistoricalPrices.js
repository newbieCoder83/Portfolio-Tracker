const path = require('path');
const XLSX = require('xlsx');
const { initializeSchema } = require('../db/schema');
const { upsertHistoricalPriceRows } = require('../services/historicalPriceService');

const FILE_METADATA = {
  'anss historical.xlsx': {
    ticker: 'ANSS_US_EQ',
    isin: 'US03662Q1058',
    sourceSymbol: 'ANSS',
  },
  'dark historical.xlsx': {
    ticker: 'DARKl_EQ',
    isin: 'GB00BNYK8G86',
    sourceSymbol: 'DARK',
  },
  'stor historical.xlsx': {
    ticker: 'STOR_US_EQ',
    isin: 'US8621211007',
    sourceSymbol: 'STOR',
  },
  'maxr historical.xlsx': {
    ticker: 'MAXR_US_EQ',
    isin: 'US57778K1051',
    sourceSymbol: 'MAXR',
  },
};

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

    if (args[key] === undefined) {
      args[key] = next;
    } else if (Array.isArray(args[key])) {
      args[key].push(next);
    } else {
      args[key] = [args[key], next];
    }
    index += 1;
  }

  return args;
}

function requireArg(args, name) {
  if (!args[name]) {
    throw new Error(`Missing required --${name} argument`);
  }

  return args[name];
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

function pad2(value) {
  return String(value).padStart(2, '0');
}

function excelDateToDateKey(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const serial = Number(value);
  if (Number.isFinite(serial)) {
    const parsed = XLSX.SSF.parse_date_code(serial);
    if (parsed) {
      return `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }

  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const parsedDate = new Date(text);
  if (!Number.isNaN(parsedDate.getTime())) {
    return `${parsedDate.getFullYear()}-${pad2(parsedDate.getMonth() + 1)}-${pad2(parsedDate.getDate())}`;
  }

  return null;
}

function getCaseInsensitive(row, name) {
  const wanted = String(name).toLowerCase();
  const key = Object.keys(row).find((candidate) => String(candidate).toLowerCase() === wanted);
  return key ? row[key] : undefined;
}

function getMetadataForFile(file) {
  const baseName = path.basename(file).toLowerCase();
  return FILE_METADATA[baseName] || {};
}

function parseRows(file, source) {
  const sourceFile = path.resolve(file);
  const metadata = getMetadataForFile(sourceFile);
  const workbook = XLSX.readFile(sourceFile, { raw: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error('Could not find a worksheet in the supplied file');
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  const parsedRows = [];
  const skippedRows = [];
  const tickers = new Set();
  const isins = new Set();
  let earliest = null;
  let latest = null;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const date = excelDateToDateKey(getCaseInsensitive(row, 'date'));
    const close = asNumber(getCaseInsensitive(row, 'close'));
    const currency = asText(getCaseInsensitive(row, 'currency'));
    const ticker = asText(getCaseInsensitive(row, 'ticker')) || metadata.ticker || null;
    const isin = asText(getCaseInsensitive(row, 'isin')) || metadata.isin || null;
    const sourceSymbol = asText(getCaseInsensitive(row, 'source_symbol'))
      || asText(getCaseInsensitive(row, 'sourceSymbol'))
      || metadata.sourceSymbol
      || null;

    if (!date || !Number.isFinite(close) || close <= 0 || !currency || (!ticker && !isin)) {
      skippedRows.push({
        row: index + 2,
        reason: 'requires date, positive close, currency, and ticker or isin',
      });
      continue;
    }

    parsedRows.push({
      ticker,
      isin,
      barDate: date,
      close,
      currency,
      source,
      sourceSymbol,
    });

    if (ticker) {
      tickers.add(ticker);
    }
    if (isin) {
      isins.add(isin);
    }
    earliest = !earliest || date < earliest ? date : earliest;
    latest = !latest || date > latest ? date : latest;
  }

  return {
    parsedRows,
    skippedRows,
    summary: {
      file: sourceFile,
      source,
      parsed: parsedRows.length,
      skipped: skippedRows.length,
      earliest,
      latest,
      tickers: [...tickers].sort(),
      isins: [...isins].sort(),
      metadataApplied: Boolean(metadata.ticker || metadata.isin),
    },
  };
}

function importHistoricalPrices({ file, files, source, dryRun = false }) {
  const inputFiles = files || (Array.isArray(file) ? file : [file]);
  const parsedFiles = inputFiles.map((inputFile) => parseRows(inputFile, source));
  const parsedRows = parsedFiles.flatMap((result) => result.parsedRows);
  const skippedRows = parsedFiles.flatMap((result) => (
    result.skippedRows.map((row) => ({ file: result.summary.file, ...row }))
  ));

  if (!dryRun) {
    initializeSchema();
  }
  const imported = dryRun ? 0 : upsertHistoricalPriceRows(parsedRows, source);

  return {
    source,
    dryRun,
    parsed: parsedRows.length,
    skipped: skippedRows.length,
    imported,
    files: parsedFiles.map((result) => result.summary),
    skippedRows: skippedRows.slice(0, 20),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const fileArg = requireArg(args, 'file');
  const source = requireArg(args, 'source');
  const result = importHistoricalPrices({
    files: Array.isArray(fileArg) ? fileArg : [fileArg],
    source,
    dryRun: Boolean(args['dry-run']),
  });

  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`[ImportHistoricalPrices] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { importHistoricalPrices, parseRows };
