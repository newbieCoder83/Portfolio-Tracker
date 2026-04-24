import React, { useMemo, useState } from 'react';
import {
  Card, CardContent, Typography, Box, Divider, Chip, Button, Alert, CircularProgress,
  FormControlLabel, Switch, Tooltip,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { Chart } from '@highcharts/react';
import { formatCurrency } from '../utils/highchartsUtils';
import api from '../api/client';

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

function tooltipFormatter() {
  const date = Number.isFinite(this.x) ? dateFormatter.format(new Date(this.x)) : '';
  const points = this.points || [];
  const totalPoint = points.find((point) => point.series.name === 'Total value');
  const depositsPoint = points.find((point) => point.series.name === 'Net deposits');
  const currency = totalPoint?.point?.options?.custom?.currency
    || depositsPoint?.point?.options?.custom?.currency
    || 'GBP';

  const totalValue = Number(totalPoint?.y);
  const netDeposits = Number(depositsPoint?.y);

  return `
    <b>${date}</b><br/>
    Total value: <b>${formatCurrency(totalValue, currency)}</b><br/>
    Net deposits: <b>${formatCurrency(netDeposits, currency)}</b>
  `;
}

function formatQty(qty) {
  if (!Number.isFinite(qty)) {
    return '—';
  }
  return qty.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 6 });
}

function formatRatio(ratio) {
  if (!Number.isFinite(ratio) || ratio === 0) {
    return '—';
  }
  return `${ratio.toFixed(3)}×`;
}

export default function RawTotalReturnChart({ totalReturn, onRefreshComplete }) {
  const points = totalReturn?.points || [];
  const currency = totalReturn?.currency || 'GBP';
  const diagnostics = totalReturn?.diagnostics || {};
  const deltaPercent = diagnostics.deltaPercent;
  const currentSummaryValue = diagnostics.currentSummaryValue;
  const reconstructedLatestValue = diagnostics.reconstructedLatestValue;
  const missingSymbols = totalReturn?.missingSymbols || [];
  const estimatedSymbols = totalReturn?.estimatedSymbols || [];
  const historicalPriceSymbols = totalReturn?.historicalPriceSymbols || [];
  const staleHoldings = diagnostics.staleHoldings || [];
  const mismatchedHoldings = diagnostics.mismatchedHoldings || [];

  const [refreshState, setRefreshState] = useState({ status: 'idle', message: null });
  const [forceRefresh, setForceRefresh] = useState(false);

  const handleRefreshHistoricalPrices = async () => {
    setRefreshState({ status: 'loading', message: null });
    try {
      const url = forceRefresh
        ? '/api/history/historical-prices/refresh?force=true'
        : '/api/history/historical-prices/refresh';
      const { data } = await api.post(url, { tickers: estimatedSymbols });
      const seconds = data?.durationMs ? (data.durationMs / 1000).toFixed(1) : '?';
      setRefreshState({
        status: 'success',
        message: `Requested ${data?.requested ?? estimatedSymbols.length}, fetched ${data?.fetched ?? 0} symbols (${data?.insertedRows ?? 0} rows), cached ${data?.cached ?? 0} skipped, failed ${data?.failed ?? 0} - ${seconds}s`,
      });
      if (onRefreshComplete) {
        await onRefreshComplete();
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Refresh failed';
      setRefreshState({ status: 'error', message: msg });
    }
  };

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
          custom: { currency },
        };
      })
      .filter((point) => point && Number.isFinite(point.totalValue) && Number.isFinite(point.netDeposits));
  }, [points, currency]);

  const chartOptions = useMemo(() => ({
    chart: {
      type: 'line',
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
      formatter: tooltipFormatter,
    },
    plotOptions: {
      series: {
        animation: { duration: 400 },
        marker: { enabled: false },
      },
      line: {
        lineWidth: 2,
      },
    },
    series: [
      {
        type: 'line',
        name: 'Total value',
        color: '#5c6bc0',
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
          <Typography variant="h6" gutterBottom>Total Return (raw)</Typography>
          <Typography color="text.secondary">
            No reconstructed history yet. Sync to fetch transaction and order history.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const hasDiscrepancy = Number.isFinite(deltaPercent)
    && Number.isFinite(currentSummaryValue)
    && Number.isFinite(reconstructedLatestValue);

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        <Typography variant="h6" gutterBottom>Total Return (raw)</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Raw reconstruction from Trading 212 orders, transactions and dividends. No reconciliation against the T212 account summary.
        </Typography>
        {hasDiscrepancy && (
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            Latest reconstructed value: {formatCurrency(reconstructedLatestValue, currency)} ·
            {' '}T212 summary value: {formatCurrency(currentSummaryValue, currency)} ·
            {' '}delta: {deltaPercent.toFixed(2)}%
          </Typography>
        )}
        <Box sx={{ flexGrow: 1, minHeight: 420 }}>
          <Chart
            options={chartOptions}
            containerProps={{ style: { width: '100%', height: '100%' } }}
          />
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="subtitle2">Diagnostics</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="When off, only fetches fill-fallback tickers we have not checked in the last 30 days. TwelveData may not cover delisted symbols on Basic, so CSV import is the reliable backup.">
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={forceRefresh}
                    onChange={(e) => setForceRefresh(e.target.checked)}
                    disabled={refreshState.status === 'loading'}
                  />
                }
                label={<Typography variant="caption">Force re-fetch displayed</Typography>}
                sx={{ mr: 0 }}
              />
            </Tooltip>
            <Button
              size="small"
              variant="outlined"
              onClick={handleRefreshHistoricalPrices}
              disabled={refreshState.status === 'loading' || estimatedSymbols.length === 0}
              startIcon={refreshState.status === 'loading' ? <CircularProgress size={14} /> : null}
            >
              {refreshState.status === 'loading' ? 'Refreshing...' : 'Refresh historical prices'}
            </Button>
          </Box>
        </Box>

        {refreshState.status === 'success' && refreshState.message && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setRefreshState({ status: 'idle', message: null })}>
            {refreshState.message}
          </Alert>
        )}
        {refreshState.status === 'error' && refreshState.message && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setRefreshState({ status: 'idle', message: null })}>
            {refreshState.message}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
          <Chip
            size="small"
            label={`Missing prices: ${missingSymbols.length}`}
            color={missingSymbols.length > 0 ? 'error' : 'default'}
            variant="outlined"
          />
          <Chip
            size="small"
            label={`Estimated (fill-fallback): ${estimatedSymbols.length}`}
            color={estimatedSymbols.length > 0 ? 'warning' : 'default'}
            variant="outlined"
          />
          <Chip
            size="small"
            label={`Cached historical prices: ${historicalPriceSymbols.length}`}
            color={historicalPriceSymbols.length > 0 ? 'info' : 'default'}
            variant="outlined"
          />
          <Chip
            size="small"
            label={`Stale holdings: ${staleHoldings.length}`}
            color={staleHoldings.length > 0 ? 'warning' : 'default'}
            variant="outlined"
          />
          <Chip
            size="small"
            label={`Mismatched holdings: ${mismatchedHoldings.length}`}
            color={mismatchedHoldings.length > 0 ? 'error' : 'default'}
            variant="outlined"
          />
        </Box>

        {missingSymbols.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Missing prices (excluded from value entirely):
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
              {missingSymbols.join(', ')}
            </Typography>
          </Box>
        )}

        {estimatedSymbols.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Using fill-price fallback (Yahoo unavailable, less accurate):
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
              {estimatedSymbols.join(', ')}
            </Typography>
          </Box>
        )}

        {historicalPriceSymbols.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Using cached historical prices (Yahoo unavailable, better than fill-price fallback):
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
              {historicalPriceSymbols.join(', ')}
            </Typography>
          </Box>
        )}

        {mismatchedHoldings.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Mismatched share counts (reconstructed vs T212 — a ratio far from 1.0× usually means a stock split or corporate action the API path can't see):
            </Typography>
            <Table size="small" sx={{ '& .MuiTableCell-root': { py: 0.5, fontSize: '0.78rem' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Ticker</TableCell>
                  <TableCell align="right">Reconstructed</TableCell>
                  <TableCell align="right">T212 actual</TableCell>
                  <TableCell align="right">Ratio</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {mismatchedHoldings.map((h) => (
                  <TableRow key={h.ticker}>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{h.ticker}</TableCell>
                    <TableCell align="right">{formatQty(h.reconstructedQty)}</TableCell>
                    <TableCell align="right">{formatQty(h.currentQty)}</TableCell>
                    <TableCell align="right">{formatRatio(h.ratio)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}

        {staleHoldings.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Stale holdings (in reconstruction, not in T212 positions — sold but reconstructed leftover, or ticker changed):
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
              {staleHoldings.map((h) => `${h.ticker} (${formatQty(h.reconstructedQty)})`).join(', ')}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
