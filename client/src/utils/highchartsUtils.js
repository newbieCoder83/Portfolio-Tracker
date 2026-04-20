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
