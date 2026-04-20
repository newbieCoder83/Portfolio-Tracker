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

// --- Highcharts Grid helpers ---
// Invoked by Grid as cell formatters — `this` is the cell context, value via this.value.

export function plCellFormatter() {
  const value = Number(this.value ?? 0);
  const color = value >= 0 ? '#4caf50' : '#f44336';
  const sign = value > 0 ? '+' : '';
  return `<span style="color:${color};font-weight:600">${sign}${value.toFixed(2)}</span>`;
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
