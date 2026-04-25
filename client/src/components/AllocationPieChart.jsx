import React, { useMemo, useState } from 'react';
import {
  Card, CardContent, Typography, Box, Dialog, DialogTitle,
  DialogContent, IconButton, Divider, List, ListItemButton, ListItemText,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { Chart } from '@highcharts/react';
import 'highcharts/esm/modules/pattern-fill.src.js';
import { formatCurrency } from '../utils/highchartsUtils';

const COLORS = [
  '#5c6bc0', '#26c6da', '#66bb6a', '#ffa726', '#ef5350',
  '#ab47bc', '#42a5f5', '#ec407a', '#8d6e63', '#78909c',
  '#d4e157', '#29b6f6', '#ff7043', '#9ccc65', '#26a69a',
];

const PATTERN_PATHS = [
  'M 0 0 L 6 6 M 5.5 -0.5 L 6.5 0.5 M -0.5 5.5 L 0.5 6.5',
  'M 0 6 L 6 0 M -0.5 0.5 L 0.5 -0.5 M 5.5 6.5 L 6.5 5.5',
  'M 2 0 L 2 6 M 5 0 L 5 6',
  'M 0 2 L 6 2 M 0 5 L 6 5',
  'M 3 0 L 3 6 M 0 3 L 6 3',
  'M 1 1 L 5 5 M 5 1 L 1 5',
  'M 3 3 m -2 0 a 2 2 0 1 1 4 0 a 2 2 0 1 1 -4 0',
];

const THRESHOLD = 0.015;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function truncateLabel(value, maxLength = 14) {
  const label = String(value ?? '');
  return label.length > maxLength ? `${label.slice(0, maxLength)}...` : label;
}

function formatGbp(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? formatCurrency(amount) : '-';
}

function getPatternColor(index) {
  const baseColor = COLORS[index % COLORS.length];
  const path = PATTERN_PATHS[index % PATTERN_PATHS.length];

  return {
    pattern: {
      backgroundColor: baseColor,
      path: {
        d: path,
        stroke: 'rgba(255,255,255,0.48)',
        strokeWidth: 1.2,
      },
      width: 8,
      height: 8,
      opacity: 0.95,
    },
  };
}

function allocationTooltipFormatter() {
  const point = this.point;
  const name = escapeHtml(point?.name);
  const value = Number(point?.y ?? 0);
  const pct = point?.options?.custom?.pct ?? (
    Number.isFinite(point?.percentage) ? point.percentage.toFixed(1) : '0.0'
  );

  return `
    <b>${name}</b><br/>
    ${formatCurrency(value)} (${pct}%)
  `;
}

export default function AllocationPieChart({ positions }) {
  const [selectedSlice, setSelectedSlice] = useState(null);
  const [otherExpanded, setOtherExpanded] = useState(false);

  const { total, smallPositions, chartData } = useMemo(() => {
    const nextTotal = positions?.reduce((sum, position) => (
      sum + (position.wallet_current_value || 0)
    ), 0) || 0;

    const positivePositions = (positions || []).filter(
      (position) => position.wallet_current_value > 0
    );

    const mainPositions = positivePositions.filter(
      (position) => nextTotal > 0 && position.wallet_current_value / nextTotal >= THRESHOLD
    );
    const nextSmallPositions = positivePositions.filter(
      (position) => nextTotal > 0 && position.wallet_current_value / nextTotal < THRESHOLD
    );

    const nextData = mainPositions
      .map((position) => ({
        name: position.instrument_name || position.ticker,
        value: position.wallet_current_value,
        pct: nextTotal > 0 ? ((position.wallet_current_value / nextTotal) * 100).toFixed(1) : '0.0',
        raw: position,
      }))
      .sort((a, b) => b.value - a.value);

    if (nextSmallPositions.length > 0) {
      const otherValue = nextSmallPositions.reduce(
        (sum, position) => sum + position.wallet_current_value,
        0
      );

      nextData.push({
        name: `Other (${nextSmallPositions.length} holdings)`,
        value: otherValue,
        pct: nextTotal > 0 ? ((otherValue / nextTotal) * 100).toFixed(1) : '0.0',
        isOther: true,
        holdings: nextSmallPositions,
      });
    }

    return {
      total: nextTotal,
      smallPositions: nextSmallPositions,
      chartData: nextData.map((entry, index) => ({
        name: entry.name,
        y: entry.value,
        color: getPatternColor(index),
        custom: {
          baseColor: COLORS[index % COLORS.length],
          pct: entry.pct,
          slice: entry,
        },
      })),
    };
  }, [positions]);

  const chartOptions = useMemo(() => ({
    chart: {
      type: 'pie',
      backgroundColor: 'transparent',
      spacingTop: 8,
      spacingRight: 8,
      spacingBottom: 8,
      spacingLeft: 8,
    },
    title: { text: null },
    credits: { enabled: false },
    legend: { enabled: false },
    tooltip: {
      useHTML: true,
      formatter: allocationTooltipFormatter,
    },
    plotOptions: {
      series: {
        animation: { duration: 400 },
      },
      pie: {
        allowPointSelect: false,
        borderColor: '#111827',
        borderWidth: 2,
        center: ['50%', '50%'],
        cursor: 'pointer',
        innerSize: '56%',
        showInLegend: false,
        size: '77%',
        slicedOffset: 6,
        states: {
          hover: {
            brightness: 0.08,
            halo: {
              size: 8,
              opacity: 0.16,
            },
          },
        },
        dataLabels: {
          enabled: true,
          allowOverlap: false,
          connectorColor: 'rgba(255,255,255,0.34)',
          connectorPadding: 3,
          connectorShape: 'fixedOffset',
          connectorWidth: 1,
          crop: false,
          distance: 14.3,
          overflow: 'allow',
          padding: 1,
          softConnector: false,
          style: {
            color: '#e0e0e0',
            fontSize: '10px',
            fontWeight: '600',
            textOutline: 'none',
          },
          formatter() {
            const point = this.point;
            const pct = point?.options?.custom?.pct ?? (
              Number.isFinite(point?.percentage) ? point.percentage.toFixed(1) : '0.0'
            );
            return `${truncateLabel(point?.name)} ${pct}%`;
          },
        },
        point: {
          events: {
            click() {
              const slice = this.options?.custom?.slice;

              if (!slice) {
                return;
              }

              if (slice.isOther) {
                setOtherExpanded(true);
                setSelectedSlice(null);
                return;
              }

              setSelectedSlice(slice);
              setOtherExpanded(false);
            },
          },
        },
      },
    },
    series: [
      {
        type: 'pie',
        name: 'Portfolio Allocation',
        data: chartData,
      },
    ],
    responsive: {
      rules: [
        {
          condition: { maxWidth: 620 },
          chartOptions: {
            plotOptions: {
              pie: {
                size: '67%',
                dataLabels: {
                  distance: 10,
                  style: { fontSize: '9px' },
                },
              },
            },
          },
        },
      ],
    },
  }), [chartData]);

  if (!positions || positions.length === 0 || chartData.length === 0) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Portfolio Allocation</Typography>
          <Typography color="text.secondary">No positions to display</Typography>
        </CardContent>
      </Card>
    );
  }

  const renderPositionDetail = (pos) => {
    if (!pos) return null;
    const currentValue = pos.wallet_current_value || 0;
    const pl = pos.wallet_unrealized_pl || 0;
    const totalCost = pos.wallet_total_cost || 0;
    const gainLossPct = totalCost > 0 ? (pl / totalCost) * 100 : 0;
    const weight = total > 0 ? ((currentValue / total) * 100).toFixed(1) : 0;
    const glColor = pl >= 0 ? '#4caf50' : '#f44336';

    return (
      <>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {pos.ticker}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">Current Value</Typography>
            <Typography variant="body2">{formatGbp(currentValue)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">Portfolio Weight</Typography>
            <Typography variant="body2">{weight}%</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">Shares</Typography>
            <Typography variant="body2">{pos.quantity || 0}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">Avg Buy Price</Typography>
            <Typography variant="body2">{formatGbp(pos.average_price_paid || 0)}</Typography>
          </Box>
          <Divider sx={{ my: 0.5 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">Result</Typography>
            <Typography variant="body2" sx={{ color: glColor }}>
              {formatGbp(pl)} ({gainLossPct >= 0 ? '+' : ''}{gainLossPct.toFixed(1)}%)
            </Typography>
          </Box>
          <Divider sx={{ my: 0.5 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">Dividends Received</Typography>
            <Typography variant="body2">{formatGbp(pos.dividend_income || 0)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">Dividend Payments</Typography>
            <Typography variant="body2">{pos.dividend_count || 0}</Typography>
          </Box>
        </Box>
      </>
    );
  };

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        <Typography variant="h6" gutterBottom>Portfolio Allocation</Typography>
        <Box sx={{ flexGrow: 1, minHeight: 420 }}>
          <Chart
            options={chartOptions}
            containerProps={{ style: { width: '100%', height: '100%' } }}
          />
        </Box>
      </CardContent>

      <Dialog
        open={!!selectedSlice}
        onClose={() => setSelectedSlice(null)}
        PaperProps={{ sx: { bgcolor: 'background.paper', minWidth: 340 } }}
      >
        {selectedSlice && (
          <>
            <DialogTitle sx={{ pr: 6 }}>
              {selectedSlice.raw?.instrument_name || selectedSlice.name}
              <IconButton
                onClick={() => setSelectedSlice(null)}
                sx={{ position: 'absolute', right: 8, top: 8 }}
              >
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent>
              {renderPositionDetail(selectedSlice.raw)}
            </DialogContent>
          </>
        )}
      </Dialog>

      <Dialog
        open={otherExpanded}
        onClose={() => setOtherExpanded(false)}
        PaperProps={{ sx: { bgcolor: 'background.paper', minWidth: 340 } }}
      >
        <DialogTitle sx={{ pr: 6 }}>
          Other ({smallPositions.length} holdings)
          <IconButton
            onClick={() => setOtherExpanded(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ px: 0 }}>
          <List disablePadding>
            {smallPositions
              .slice()
              .sort((a, b) => b.wallet_current_value - a.wallet_current_value)
              .map((p) => {
                const weight = total > 0 ? ((p.wallet_current_value / total) * 100).toFixed(1) : 0;
                return (
                  <ListItemButton
                    key={p.ticker}
                    onClick={() => {
                      setOtherExpanded(false);
                      setSelectedSlice({
                        name: p.instrument_name || p.ticker,
                        raw: p,
                      });
                    }}
                  >
                    <ListItemText
                      primary={p.instrument_name || p.ticker}
                      secondary={`${formatGbp(p.wallet_current_value)} \u00b7 ${weight}%`}
                    />
                  </ListItemButton>
                );
              })}
          </List>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
