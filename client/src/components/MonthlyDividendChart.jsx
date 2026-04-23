import React, { useMemo } from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';
import { Chart } from '@highcharts/react';
import { Drilldown } from '@highcharts/react/options/drilldown';
import { formatCurrency, currencyYAxisConfig } from '../utils/highchartsUtils';

const monthTickFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function truncateCategoryLabel(value) {
  const label = String(value ?? '');
  return label.length > 18 ? `${label.slice(0, 18)}...` : label;
}

function parseMonthToUtc(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number);

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return null;
  }

  return Date.UTC(year, month - 1, 1);
}

function formatMonthLabel(value) {
  const timestamp = Number(value);

  if (!Number.isFinite(timestamp)) {
    return String(value ?? '');
  }

  return monthTickFormatter.format(new Date(timestamp));
}

function buildDatetimeXAxisConfig() {
  return {
    type: 'datetime',
    tickPixelInterval: 140,
    labels: {
      rotation: 0,
      autoRotation: undefined,
      style: { fontSize: '11px' },
      formatter() {
        return formatMonthLabel(this.value);
      },
    },
  };
}

function buildCategoryXAxisConfig() {
  return {
    type: 'category',
    labels: {
      rotation: -45,
      style: { fontSize: '10px' },
      formatter() {
        return truncateCategoryLabel(this.value);
      },
    },
  };
}

function monthlyDividendTooltipFormatter() {
  const point = this.point;
  const amount = Number(point?.y ?? 0);

  if (point?.options?.drilldown) {
    const monthLabel = point?.options?.custom?.monthLabel || point?.name;
    return `${monthLabel}<br/><b>${formatCurrency(amount)}</b>`;
  }

  const fullName = point?.options?.custom?.fullName || point?.name || 'Unknown';
  const pct = point?.options?.custom?.pct;
  const pctText = Number.isFinite(pct) ? ` (${pct.toFixed(1)}%)` : '';

  return `${fullName}<br/><b>${formatCurrency(amount)}</b>${pctText}`;
}

export default function MonthlyDividendChart({ dividends }) {
  const { monthlySeriesData, drilldownSeries } = useMemo(() => {
    if (!dividends || dividends.length === 0) {
      return { monthlySeriesData: [], drilldownSeries: [] };
    }

    const byMonth = {};

    dividends.forEach((dividend) => {
      if (!dividend.paid_on) {
        return;
      }

      const month = dividend.paid_on.slice(0, 7);
      const monthStartUtc = parseMonthToUtc(month);
      if (monthStartUtc === null) {
        return;
      }

      const amount = Number(dividend.amount ?? 0);
      if (!Number.isFinite(amount)) {
        return;
      }

      const companyName = dividend.instrument_name || dividend.ticker || 'Unknown';

      if (!byMonth[month]) {
        byMonth[month] = {
          month,
          monthStartUtc,
          total: 0,
          companies: {},
        };
      }

      byMonth[month].total += amount;
      byMonth[month].companies[companyName] = (byMonth[month].companies[companyName] || 0) + amount;
    });

    const monthlyEntries = Object.values(byMonth).sort((a, b) => a.monthStartUtc - b.monthStartUtc);

    return {
      monthlySeriesData: monthlyEntries.map((entry) => ({
        name: entry.month,
        x: entry.monthStartUtc,
        y: entry.total,
        drilldown: entry.month,
        custom: {
          monthLabel: formatMonthLabel(entry.monthStartUtc),
        },
      })),
      // Build the per-month company series once so drilldown uses the same grouped source data.
      drilldownSeries: monthlyEntries.map((entry) => ({
        id: entry.month,
        type: 'column',
        name: `${entry.month} Breakdown`,
        colorByPoint: true,
        data: Object.entries(entry.companies)
          .map(([name, amount]) => ({
            name,
            y: amount,
            custom: {
              fullName: name,
              pct: entry.total > 0 ? (amount / entry.total) * 100 : 0,
            },
          }))
          .sort((a, b) => b.y - a.y),
      })),
    };
  }, [dividends]);

  const chartOptions = useMemo(() => ({
    chart: {
      type: 'column',
      backgroundColor: 'transparent',
      spacingTop: 8,
      spacingBottom: 28,
      events: {
        drilldown() {
          this.xAxis[0].update(buildCategoryXAxisConfig(), false);
        },
        drillup() {
          this.xAxis[0].update(buildDatetimeXAxisConfig(), false);
        },
      },
    },
    title: { text: null },
    credits: { enabled: false },
    legend: { enabled: false },
    xAxis: buildDatetimeXAxisConfig(),
    yAxis: {
      ...currencyYAxisConfig,
      title: { text: null },
    },
    tooltip: {
      useHTML: true,
      formatter: monthlyDividendTooltipFormatter,
    },
    plotOptions: {
      series: {
        animation: { duration: 400 },
      },
      column: {
        borderRadius: 4,
        pointPadding: 0.08,
      },
    },
    series: [
      {
        type: 'column',
        name: 'Monthly Dividends',
        data: monthlySeriesData,
        color: '#66bb6a',
        dataLabels: { enabled: false },
      },
    ],
  }), [monthlySeriesData]);

  if (!dividends || dividends.length === 0) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Monthly Dividends</Typography>
          <Typography color="text.secondary">No dividend history.</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>Monthly Dividends</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Click a month to drill down by company. Use the breadcrumb to go back.
        </Typography>
        <Box sx={{ height: 440 }}>
          <Chart
            options={chartOptions}
            containerProps={{ style: { width: '100%', height: '100%' } }}
          >
            <Drilldown
              series={drilldownSeries}
              breadcrumbs={{
                floating: false,
                position: { align: 'left' },
              }}
            />
          </Chart>
        </Box>
      </CardContent>
    </Card>
  );
}
