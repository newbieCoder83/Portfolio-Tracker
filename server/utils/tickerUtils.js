const YAHOO_SYMBOL_OVERRIDES = {
  CNX1_EQ: 'CNX1.L',
  DEAC_US_EQ: 'DKNG',
  HCN_US_EQ: 'WELL',
  IPOE_US_EQ: 'SOFI',
  VACQ_US_EQ: 'RKLB',
};

function normaliseToYahooDefault(t212Ticker) {
  if (!t212Ticker) {
    return '';
  }

  let ticker = String(t212Ticker)
    .replace(/_US_EQ$/, '')
    .replace(/_EQ$/, '');

  // T212 uses lowercase "l" at the end for some LSE listings, e.g. VMIDl -> VMID.L.
  if (ticker.endsWith('l') && ticker === ticker.toUpperCase().slice(0, -1) + 'l') {
    return ticker.slice(0, -1) + '.L';
  }

  const lowerExchangeSuffixMap = {
    d: '.DE',
    p: '.PA',
  };
  const lowerExchangeMatch = ticker.match(/^([A-Z0-9]+)([a-z])$/);
  if (lowerExchangeMatch && lowerExchangeSuffixMap[lowerExchangeMatch[2]]) {
    return lowerExchangeMatch[1] + lowerExchangeSuffixMap[lowerExchangeMatch[2]];
  }

  const suffixMap = {
    _LON: '.L',
    _EAM: '.AS',
    _EPA: '.PA',
    _ETR: '.DE',
    _BME: '.MC',
    _BIT: '.MI',
    _HEL: '.HE',
    _WSE: '.WA',
    _ATH: '.AT',
    _OMX: '.ST',
    _CPH: '.CO',
    _OSL: '.OL',
    _ISE: '.IR',
    _TSX: '.TO',
    _ASX: '.AX',
    _SGX: '.SI',
    _HKE: '.HK',
  };

  for (const [t212Suffix, yahooSuffix] of Object.entries(suffixMap)) {
    if (String(t212Ticker).includes(t212Suffix)) {
      return String(t212Ticker).split(t212Suffix)[0] + yahooSuffix;
    }
  }

  return ticker;
}

function normaliseToYahoo(t212Ticker) {
  const override = YAHOO_SYMBOL_OVERRIDES[String(t212Ticker)];
  return override || normaliseToYahooDefault(t212Ticker);
}

function getYahooSymbolCandidates(t212Ticker) {
  const override = YAHOO_SYMBOL_OVERRIDES[String(t212Ticker)];
  const defaultSymbol = normaliseToYahooDefault(t212Ticker);

  return [...new Set([override, defaultSymbol].filter(Boolean))];
}

module.exports = { getYahooSymbolCandidates, normaliseToYahoo };
