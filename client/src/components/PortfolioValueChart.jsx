import React, { useMemo } from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';
import { Chart } from '@highcharts/react';
import { formatCurrency } from '../utils/highchartsUtils';

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function parseDateToUtc(dateKey) {
  const [year, month, day] = String(dateKey ?? '').split('-').map(Number);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  return Date.UTC(year, month - 1, day);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return 'N/A';
  }

  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function totalReturnTooltipFormatter() {
  const date = Number.isFinite(this.x) ? dateFormatter.format(new Date(this.x)) : '';
  const points = this.points || [];
  const totalPoint = points.find((point) => point.series.name === 'Total value');
  const depositsPoint = points.find((point) => point.series.name === 'Net deposits');
  const custom = totalPoint?.point?.options?.custom || depositsPoint?.point?.options?.custom || {};

  const totalValue = Number(totalPoint?.y);
  const netDeposits = Number(depositsPoint?.y);
  const returnValue = Number(custom.returnValue);
  const returnPct = custom.returnPct === null || custom.returnPct === undefined
    ? NaN
    : Number(custom.returnPct);
  const reconciliationAdjustment = Number(custom.netDepositReconciliationAdjustment);
  const valueAdjustment = Number(custom.marketValueReconciliationAdjustment);
  const returnColor = returnValue >= 0 ? '#4caf50' : '#f44336';

  return `
    <b>${date}</b><br/>
    Total value: <b>${formatCurrency(totalValue, custom.currency)}</b><br/>
    Net deposits: <b>${formatCurrency(netDeposits, custom.currency)}</b><br/>
    Return: <b style="color:${returnColor}">${formatCurrency(returnValue, custom.currency)} (${formatPercent(returnPct)})</b>
    ${Number.isFinite(reconciliationAdjustment) && reconciliationAdjustment !== 0
    ? `<br/>Net deposits adjustment: <b>${formatCurrency(reconciliationAdjustment, custom.currency)}</b>`
    : ''}
    ${Number.isFinite(valueAdjustment) && valueAdjustment !== 0
    ? `<br/>Trading 212 value anchor: <b>${formatCurrency(valueAdjustment, custom.currency)}</b>`
    : ''}
  `;
}

export default function PortfolioValueChart({ totalReturn }) {
  const points = totalReturn?.points || [];
  const currency = totalReturn?.currency || 'GBP';
  const unavailableReason = totalReturn?.unavailableReason;
  const netDepositReconciliationAdjustment = totalReturn?.diagnostics?.netDepositReconciliationAdjustment;
  const marketValueReconciliationAdjustment = totalReturn?.diagnostics?.marketValueReconciliationAdjustment;
  const netDepositsAnchorDate = totalReturn?.diagnostics?.netDepositsAnchorDate;
  const lastPointDate = points[points.length - 1]?.date;

  const chartData = useMemo(() => {
    return points
      .map((point) => {
        const x = parseDateToUtc(point.date);

        if (x === null) {
          return null;
        }

        return {
          x,
          totalValue: Number(point.totalValue),
          netDeposits: Number(point.netDeposits),
          custom: {
            currency,
            marketValueReconciliationAdjustment: point.date === lastPointDate
              ? marketValueReconciliationAdjustment
              : null,
            netDepositReconciliationAdjustment: point.date === netDepositsAnchorDate
              ? netDepositReconciliationAdjustment
              : null,
            returnValue: Number(point.returnValue),
            returnPct: point.returnPct === null || point.returnPct === undefined ? null : Number(point.returnPct),
          },
        };
      })
      .filter((point) => point && Number.isFinite(point.totalValue) && Number.isFinite(point.netDeposits));
  }, [
    points,
    currency,
    lastPointDate,
    marketValueReconciliationAdjustment,
    netDepositReconciliationAdjustment,
    netDepositsAnchorDate,
  ]);

  const chartOptions = useMemo(() => ({
    chart: {
      type: 'area',
      backgroundColor: 'transparent',
      spacingTop: 12,
      spacingBottom: 18,
    },
    title: { text: null },
    credits: { enabled: false },
    legend: {
      enabled: true,
      align: 'center',
      verticalAlign: 'bottom',
    },
    xAxis: {
      type: 'datetime',
      labels: {
        style: { fontSize: '11px' },
      },
    },
    yAxis: {
      title: { text: null },
      labels: {
        style: { fontSize: '11px' },
        formatter() {
          return formatCurrency(this.value, currency);
        },
      },
    },
    tooltip: {
      shared: true,
      useHTML: true,
      formatter: totalReturnTooltipFormatter,
    },
    plotOptions: {
      series: {
        animation: { duration: 400 },
        marker: { enabled: false },
      },
      area: {
        fillOpacity: 0.18,
        lineWidth: 2,
        threshold: null,
      },
    },
    series: [
      {
        type: 'area',
        name: 'Total value',
        color: '#5c6bc0',
        fillColor: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [
            [0, 'rgba(92, 107, 192, 0.32)'],
            [1, 'rgba(92, 107, 192, 0.04)'],
          ],
        },
        data: chartData.map((point) => ({
          x: point.x,
          y: point.totalValue,
          custom: point.custom,
        })),
      },
      {
        type: 'line',
        name: 'Net deposits',
        color: '#b0bec5',
        dashStyle: 'Dot',
        lineWidth: 2,
        data: chartData.map((point) => ({
          x: point.x,
          y: point.netDeposits,
          custom: point.custom,
        })),
      },
    ],
  }), [chartData, currency]);

  if (chartData.length === 0) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Total Return</Typography>
          <Typography color="text.secondary">
            {unavailableReason || 'No total return history yet. Sync to fetch transaction and order history.'}
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        <Typography variant="h6" gutterBottom>Total Return</Typography>
        {totalReturn?.estimated && (
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            Estimated from Trading 212 history and historical market prices.
          </Typography>
        )}
        {totalReturn?.missingSymbols?.length > 0 && (
          <Typography variant="caption" color="warning.main" sx={{ mb: 1, display: 'block' }}>
            Some historical prices were unavailable, so part of this line may be incomplete.
          </Typography>
        )}
        {totalReturn?.estimatedSymbols?.length > 0 && (
          <Typography variant="caption" color="warning.main" sx={{ mb: 1, display: 'block' }}>
            Some old or delisted assets use fill-price estimates: {totalReturn.estimatedSymbols.slice(0, 5).join(', ')}
            {totalReturn.estimatedSymbols.length > 5 ? '...' : ''}
          </Typography>
        )}
        <Box sx={{ flexGrow: 1, minHeight: 320 }}>
          <Chart
            options={chartOptions}
            containerProps={{ style: { width: '100%', height: '100%' } }}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
