#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { buildTotalReturnHistory } = require('../services/totalReturnService');

const TARGET_DATES = [
  '2020-11-01',
  '2021-11-01',
  '2024-10-01',
  '2025-06-04',
];

const T212_VALUES = {
  '2020-11-01': 7480.95,
  '2021-11-01': 28097.77,
  '2024-10-01': 66080.46,
  '2025-06-04': 93310.01,
};

function fmt(value, dp = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return '   —   ';
  }
  return Number(value).toFixed(dp).padStart(11);
}

function fmtSign(value, dp = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return '   —   ';
  }
  const n = Number(value);
  const s = n.toFixed(dp);
  return (n >= 0 ? `+${s}` : s).padStart(11);
}

function pct(value, dp = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return '  —  ';
  }
  const n = Number(value);
  return `${n >= 0 ? '+' : ''}${n.toFixed(dp)}%`;
}

(async () => {
  const result = await buildTotalReturnHistory({
    skipReconciliation: true,
    traceDates: TARGET_DATES,
  });

  if (!result.points || result.points.length === 0) {
    console.error('No points returned. Reason:', result.unavailableReason);
    process.exit(1);
  }

  const latestPoint = result.points[result.points.length - 1];
  const latestDate = latestPoint.date;
  const summaryValue = result.diagnostics?.currentSummaryValue ?? null;

  // Baseline table
  console.log('\n=== Baseline (T212 vs reconstructed) ===\n');
  console.log('Date       |     T212 AV |  Reconstr AV |       Δ GBP |   Δ%');
  console.log('-----------+-------------+--------------+-------------+-------');
  for (const date of TARGET_DATES) {
    const point = result.points.find((p) => p.date === date);
    if (!point) {
      console.log(`${date} |  (no point on this date)`);
      continue;
    }
    const t212 = T212_VALUES[date];
    const delta = point.totalValue - t212;
    const deltaPct = (delta / t212) * 100;
    console.log(
      `${date} | ${fmt(t212)} | ${fmt(point.totalValue)} | ${fmtSign(delta)} | ${pct(deltaPct)}`
    );
  }
  console.log(
    `${latestDate} | ${fmt(summaryValue)} | ${fmt(latestPoint.totalValue)} | ${fmtSign(latestPoint.totalValue - (summaryValue ?? 0))} | ${pct(result.diagnostics?.deltaPercent)}`
  );

  // Diagnostics summary
  const d = result.diagnostics ?? {};
  console.log('\n=== Top-level diagnostics ===\n');
  console.log(`mismatchedHoldings:  ${d.mismatchedHoldingCount ?? 0}`);
  console.log(`staleHoldings:       ${d.staleHoldingCount ?? 0}`);
  console.log(`estimatedSymbols:    ${(result.estimatedSymbols ?? []).join(', ') || '(none)'}`);
  console.log(`historicalSymbols:   ${(result.historicalPriceSymbols ?? []).join(', ') || '(none)'}`);
  console.log(`missingSymbols:      ${(result.missingSymbols ?? []).join(', ') || '(none)'}`);
  if (d.mismatchedHoldings?.length) {
    console.log('\nMismatched holdings (latest):');
    for (const m of d.mismatchedHoldings) {
      const ratio = m.ratio === null || m.ratio === undefined ? '—' : Number(m.ratio).toFixed(4);
      console.log(`  ${m.ticker.padEnd(14)} reconstructed=${fmt(m.reconstructedQty, 6)} current=${fmt(m.currentQty, 6)} ratio=${ratio}`);
    }
  }

  // Per-date trace
  const trace = d.trace;
  if (!trace) {
    console.error('\nERROR: diagnostics.trace is missing — service did not honour traceDates.');
    process.exit(1);
  }

  for (const date of TARGET_DATES) {
    const snapshot = trace.dates[date];
    if (!snapshot) {
      console.log(`\n=== ${date} === (no snapshot)`);
      continue;
    }
    const t212 = T212_VALUES[date];
    const delta = snapshot.totalValue - t212;
    console.log(`\n=== ${date}  T212=${fmt(t212)}  Recon=${fmt(snapshot.totalValue)}  Δ=${fmtSign(delta)}  ===`);
    console.log(`  cash = ${fmt(snapshot.cash)}    marketValue = ${fmt(snapshot.marketValue)}    netDeposits = ${fmt(snapshot.netDeposits)}`);

    const contributions = (snapshot.contributions ?? []).slice().sort((a, b) => {
      const av = Number.isFinite(a.gbpValue) ? Math.abs(a.gbpValue) : 0;
      const bv = Number.isFinite(b.gbpValue) ? Math.abs(b.gbpValue) : 0;
      return bv - av;
    });

    console.log('  --- per-position contributions (sorted by |gbpValue|) ---');
    console.log('  ticker         | qty (cur basis) | currency |       price | fxRate |    GBP value | source         | flags');
    let sumGbp = 0;
    for (const c of contributions) {
      sumGbp += Number.isFinite(c.gbpValue) ? c.gbpValue : 0;
      const flagBits = [];
      if (c.flags?.pricesAreSplitAdjusted) flagBits.push('splitAdj');
      if (c.flags?.historicalFromCache) flagBits.push('cached');
      if (c.flags?.estimatedFromFillsOnly) flagBits.push('fillEst');
      if (c.flags?.reason) flagBits.push(`!${c.flags.reason}`);
      console.log(
        `  ${String(c.ticker).padEnd(14)} | ${fmt(c.quantity, 6)} | ${String(c.currency || '').padEnd(8)} | ${fmt(c.selectedPrice, 4)} | ${fmt(c.fxRate, 5)} | ${fmt(c.gbpValue)} | ${String(c.priceSource || '').padEnd(14)} | ${flagBits.join(',')}`
      );
    }
    console.log(`  TOTAL marketValue (re-summed): ${fmt(sumGbp)}  (service: ${fmt(snapshot.marketValue)})`);

    if (snapshot.events?.length) {
      console.log(`  --- events on ${date} ---`);
      for (const event of snapshot.events) {
        const parts = [
          `type=${event.type}`,
          event.key ? `key=${event.key}` : null,
          Number.isFinite(event.quantity) ? `qty=${event.quantity}` : null,
          Number.isFinite(event.cashAmount) ? `cash=${Number(event.cashAmount).toFixed(2)}` : null,
          Number.isFinite(event.netDepositAmount) && event.netDepositAmount !== 0 ? `netDep=${Number(event.netDepositAmount).toFixed(2)}` : null,
          event.reconciliation ? 'RECONCILIATION' : null,
          event.quantityAlreadyInPriceBasis ? 'qtyInPriceBasis' : null,
        ].filter(Boolean);
        console.log(`    ${parts.join('  ')}`);
      }
    }
  }

  // Splits + price-source overview (latest snapshot of merged splits)
  const summary = trace.priceSeriesSummary || {};
  const summaryEntries = Object.entries(summary);
  const seriesWithSplits = summaryEntries.filter(([, v]) => v.splits && v.splits.length > 0);
  if (seriesWithSplits.length > 0) {
    console.log('\n=== Applied split factors per held key (date, factor) ===\n');
    seriesWithSplits.sort((a, b) => String(a[1].ticker || a[0]).localeCompare(String(b[1].ticker || b[0])));
    for (const [seriesKey, info] of seriesWithSplits) {
      const splitStr = info.splits.map((s) => `${s.date}:${Number(s.factor).toFixed(4)}`).join(', ');
      console.log(`  ${(info.ticker || seriesKey).padEnd(16)} ${splitStr}`);
    }
  } else {
    console.log('\n(no merged-split entries on any held key)');
  }

  const fillFallbackKeys = summaryEntries.filter(([, v]) => v.estimatedFromFillsOnly);
  const cachedKeys = summaryEntries.filter(([, v]) => v.historicalFromCache);
  const failureKeys = summaryEntries.filter(([, v]) => v.failureMessage);
  if (fillFallbackKeys.length > 0 || cachedKeys.length > 0 || failureKeys.length > 0) {
    console.log('\n=== Price-source flags per held key ===\n');
    if (fillFallbackKeys.length > 0) {
      console.log('  Fill-fallback (no Yahoo, no cached prices):');
      for (const [, v] of fillFallbackKeys) {
        console.log(`    ${(v.ticker || '').padEnd(14)} (failure: ${v.failureMessage || ''})`);
      }
    }
    if (cachedKeys.length > 0) {
      console.log('  Cached historical prices:');
      for (const [, v] of cachedKeys) {
        console.log(`    ${(v.ticker || '').padEnd(14)} (failure: ${v.failureMessage || ''})`);
      }
    }
    if (failureKeys.length > 0) {
      console.log('  Yahoo failure messages (informational):');
      for (const [, v] of failureKeys) {
        console.log(`    ${(v.ticker || '').padEnd(14)} ${v.failureMessage}`);
      }
    }
  }

  // Corporate-action diagnostics (e.g. ignored splits, broker-cash splits)
  const cad = d.corporateActionDiagnostics || [];
  if (cad.length > 0) {
    console.log('\n=== Corporate-action diagnostics ===\n');
    for (const row of cad) {
      console.log(`  ${(row.ticker || '').padEnd(14)} ${row.date || ''}  type=${row.type || ''}  action=${row.action || ''}  factor=${row.factor !== undefined ? Number(row.factor).toFixed(4) : ''}  reason=${row.reason || ''}`);
    }
  }

  console.log('\nNote: quantity is in current-share basis when the price series is Yahoo-backed (flags include splitAdj). For non-Yahoo series quantity matches the original event basis.');
})().catch((err) => {
  console.error('Harness failed:', err);
  process.exit(1);
});
