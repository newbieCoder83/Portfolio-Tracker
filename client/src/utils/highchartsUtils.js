export function formatCurrency(value, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// Zero formats as "0.00%" with no sign. Negatives carry '-' from toFixed.
export function formatPercent(value) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

// title defaults to null so callers opt in via { ...currencyYAxisConfig, title: { text: 'Value (£)' } }
export const currencyYAxisConfig = {
  title: { text: null },
  labels: {
    formatter() {
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(this.value);
    },
  },
};

export const responsiveRules = [
  {
    condition: { maxWidth: 400 },
    chartOptions: {
      legend: { enabled: false },
    },
  },
];

export function getActiveVisibleSeries(chart) {
  if (!chart?.series?.length) {
    return null;
  }

  return [...chart.series].reverse().find((series) => {
    if (!series?.visible || series.options?.isInternal) {
      return false;
    }

    return typeof (series.options?.custom?.level ?? series.userOptions?.custom?.level) === 'string';
  });
}

export function getActiveVisibleSeriesLevel(chart) {
  const activeSeries = getActiveVisibleSeries(chart);

  return activeSeries?.options?.custom?.level ?? activeSeries?.userOptions?.custom?.level ?? null;
}

// --- Highcharts Grid helpers ---
// Invoked by Grid as cell formatters — `this` is the cell context, value via this.value.

export function plCellFormatter() {
  const value = Number(this.value ?? 0);
  const color = value >= 0 ? '#4caf50' : '#f44336';
  const sign = value > 0 ? '+' : '';
  const formatted = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  return `<span style="color:${color};font-weight:600">${sign}${formatted}</span>`;
}

export function currencyCellFormatter() {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(this.value ?? 0));
}

export function percentCellFormatter() {
  const value = Number(this.value ?? 0);
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function plPercentCellFormatter() {
  const value = Number(this.value ?? 0);
  const color = value >= 0 ? '#4caf50' : '#f44336';
  const sign = value > 0 ? '+' : '';
  return `<span style="color:${color}">${sign}${value.toFixed(2)}%</span>`;
}

export function dividendAmountCellFormatter() {
  if (this.value === null || this.value === undefined) {
    return '—';
  }

  const value = Number(this.value);
  if (!Number.isFinite(value)) {
    return '—';
  }

  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatDividendNumber(value) {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function isPenceCurrency(currency) {
  const text = String(currency || '').trim();
  const upper = text.toUpperCase();
  return text === 'GBp' || ['GBX', 'GBPENCE', 'GBP.P'].includes(upper);
}

export function dividendTotalCurrencyCellFormatter() {
  if (this.value === null || this.value === undefined) {
    return '-';
  }

  const value = Number(this.value);
  if (!Number.isFinite(value)) {
    return '-';
  }

  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function dividendPerShareCurrencyCellFormatter() {
  if (this.value === null || this.value === undefined) {
    return '-';
  }

  const value = Number(this.value);
  if (!Number.isFinite(value)) {
    return '-';
  }

  const currency = String(this.row?.data?.per_share_currency || '').trim();
  if (!currency) {
    return formatDividendNumber(value);
  }

  if (isPenceCurrency(currency)) {
    return `${formatDividendNumber(value)}p`;
  }

  const currencyCode = currency.toUpperCase();
  const locale = currencyCode === 'USD' ? 'en-US' : 'en-GB';

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(value);
  } catch {
    return formatDividendNumber(value);
  }
}
