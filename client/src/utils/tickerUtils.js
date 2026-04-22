const EXCHANGE_SUFFIXES = [
  '_LON',
  '_EAM',
  '_EPA',
  '_ETR',
  '_BME',
  '_BIT',
  '_HEL',
  '_WSE',
  '_ATH',
  '_OMX',
  '_CPH',
  '_OSL',
  '_ISE',
  '_TSX',
  '_ASX',
  '_SGX',
  '_HKE',
];

export function cleanDisplayTicker(rawTicker) {
  if (!rawTicker) return '';

  let ticker = rawTicker
    .replace(/_US_EQ$/, '')
    .replace(/_EQ$/, '');

  for (const suffix of EXCHANGE_SUFFIXES) {
    if (ticker.endsWith(suffix)) {
      ticker = ticker.slice(0, -suffix.length);
      break;
    }
  }

  if (ticker.endsWith('l') && ticker === `${ticker.slice(0, -1).toUpperCase()}l`) {
    ticker = ticker.slice(0, -1);
  }

  return ticker;
}

export function resolveDisplayTicker(rawTicker, instrumentName) {
  const cleaned = cleanDisplayTicker(rawTicker);

  // Mirror the heatmap fallback idea: if the raw ticker is stale or
  // pre-merger, fall back to the instrument name to derive the expected
  // market-facing ticker.
  if (cleaned === 'VACQ' && /rocket lab/i.test(instrumentName || '')) {
    return 'RKLB';
  }

  return cleaned;
}
