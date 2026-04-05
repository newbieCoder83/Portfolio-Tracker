import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';
import { Treemap, ResponsiveContainer } from 'recharts';
import Layout from '../components/Layout';
import api from '../api/client';

// Interpolate a colour between #C0392B (deep red, -5%), #1A1A2E (neutral, 0%),
// and #00A850 (deep green, +5%). Clamps at ±5%.
function getPctColor(pct, failed) {
  if (failed) return '#333333';
  const RED     = [192, 57,  43]; // #C0392B
  const NEUTRAL = [26,  26,  46]; // #1A1A2E
  const GREEN   = [0,   168, 80]; // #00A850
  const c = Math.max(-5, Math.min(5, pct));
  const [from, to, t] = c < 0
    ? [RED,     NEUTRAL, (c + 5) / 5]
    : [NEUTRAL, GREEN,   c / 5];
  const r = Math.round(from[0] + (to[0] - from[0]) * t);
  const g = Math.round(from[1] + (to[1] - from[1]) * t);
  const b = Math.round(from[2] + (to[2] - from[2]) * t);
  return `rgb(${r},${g},${b})`;
}

// Custom SVG renderer for each treemap tile.
// depth 0 = sector group header, depth 1 = individual stock tile.
function CustomContent(props) {
  const {
    x, y, width, height, depth, name,
    ticker, pctChange, failed, onTileMouseEnter, onTileMouseLeave,
  } = props;

  if (depth === 0) {
    // Sector header — transparent fill, label only
    return (
      <g>
        <rect
          x={x} y={y} width={width} height={height}
          fill="transparent"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
        />
        {width > 60 && (
          <text
            x={x + 6} y={y + 16}
            fill="#9e9e9e" fontSize={11} fontWeight={600}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {name}
          </text>
        )}
      </g>
    );
  }

  // Stock tile
  const bgColor = props.fill || getPctColor(pctChange, failed);
  const sign = (pctChange >= 0) ? '+' : '';
  const cleanTicker = (ticker || name)
    .replace(/_US_EQ$/, '')
    .replace(/_EQ$/, '')
    .replace(/l$/, '');
  const label = (name && name !== ticker) ? name : cleanTicker;

  return (
    <g
      onMouseEnter={(e) => onTileMouseEnter && onTileMouseEnter(e, props)}
      onMouseLeave={() => onTileMouseLeave && onTileMouseLeave()}
    >
      <defs>
        <clipPath id={`clip-${x}-${y}`}>
          <rect x={x + 2} y={y + 2} width={width - 4} height={height - 4} />
        </clipPath>
      </defs>
      <rect
        x={x} y={y} width={width} height={height}
        fill={bgColor}
        stroke="rgba(0,0,0,0.3)"
        strokeWidth={1}
        rx={2}
        style={{ cursor: 'default' }}
      />
      <g clipPath={`url(#clip-${x}-${y})`}>
        {width > 40 && height > 28 && (
          <text
            x={x + width / 2}
            y={y + height / 2 - (height > 52 ? 10 : 0)}
            textAnchor="middle"
            fill="white"
            fontSize={Math.min(14, Math.floor(width / 5))}
            fontWeight={700}
            dominantBaseline="middle"
            textLength={label.length * 8 > width - 16 ? Math.max(0, width - 16) : undefined}
            lengthAdjust="spacingAndGlyphs"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {label}
          </text>
        )}
        {width > 60 && height > 52 && (
          <text
            x={x + width / 2}
            y={y + height / 2 + 12}
            textAnchor="middle"
            fill="rgba(255,255,255,0.85)"
            fontSize={10}
            dominantBaseline="middle"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {`${sign}${typeof pctChange === 'number' ? pctChange.toFixed(2) : '0.00'}%`}
          </text>
        )}
      </g>
      {failed && width > 20 && height > 20 && (
        <text
          x={x + width - 14} y={y + 14}
          fill="#ffa726" fontSize={12}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          ⚠
        </text>
      )}
    </g>
  );
}

export default function HeatmapPage({ onNavigate }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [tooltip, setTooltip] = useState(null); // { x, y, stock }

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const { data: res } = await api.get('/api/heatmap');
      setData(res);
    } catch (err) {
      setError('Failed to load heatmap data.');
      console.error('[HeatmapPage]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Total portfolio value — used to compute per-stock weights
  const totalValue = useMemo(
    () => (data?.sectors ?? []).flatMap(s => s.stocks).reduce((sum, s) => sum + s.marketValue, 0),
    [data]
  );

  // Build nested Recharts Treemap data: [{ name: sector, children: [...stocks] }]
  const treemapData = useMemo(() => {
    if (!data?.sectors?.length) return [];
    return data.sectors.map(sector => ({
      name: sector.name,
      children: sector.stocks.map(stock => ({
        name: stock.ticker,
        size: stock.marketValue,
        fill: getPctColor(stock.pctChange, stock.failed),
        ...stock,
        weight: totalValue > 0 ? (stock.marketValue / totalValue) * 100 : 0,
      })),
    }));
  }, [data, totalValue]);

  const handleTileMouseEnter = useCallback((e, stockProps) => {
    setTooltip({ x: e.clientX, y: e.clientY, stock: stockProps });
  }, []);

  const handleTileMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  // Pass event handlers into CustomContent via the content prop.
  // Recharts spreads all data fields onto the content component as props.
  const contentElement = (
    <CustomContent
      onTileMouseEnter={handleTileMouseEnter}
      onTileMouseLeave={handleTileMouseLeave}
    />
  );

  return (
    <Layout onSyncComplete={fetchData} currentPage="heatmap" onNavigate={onNavigate}>
      {data?.stale && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Showing cached data — live prices are temporarily unavailable.
        </Alert>
      )}

      {error && !data && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && !error && treemapData.length === 0 && (
        <Box sx={{ textAlign: 'center', mt: 10 }}>
          <Typography color="text.secondary">No positions to display.</Typography>
        </Box>
      )}

      {!loading && treemapData.length > 0 && (
        <Box>
          <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>
            Portfolio Heatmap
          </Typography>

          <ResponsiveContainer width="100%" height={640}>
            <Treemap
              data={treemapData}
              dataKey="size"
              aspectRatio={4 / 3}
              content={contentElement}
              isAnimationActive={false}
            />
          </ResponsiveContainer>
        </Box>
      )}

      {/* Floating tooltip — rendered outside SVG so it isn't clipped */}
      {tooltip && (() => {
        const s = tooltip.stock;
        const sign = (s.pctChange >= 0) ? '+' : '';
        const changeGbp = s.currentPrice && s.pctChange != null
          ? (s.currentPrice * s.pctChange / 100).toFixed(2)
          : null;
        const tooltipX = Math.min(tooltip.x + 12, window.innerWidth - 240);
        const tooltipY = tooltip.y - 10;
        return (
          <Box
            sx={{
              position: 'fixed',
              left: tooltipX,
              top: tooltipY,
              bgcolor: 'background.paper',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 1,
              p: 1.5,
              zIndex: 9999,
              pointerEvents: 'none',
              minWidth: 200,
              maxWidth: 240,
            }}
          >
            <Typography variant="body2" fontWeight={700} sx={{ mb: 0.25 }}>
              {s.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
              {s.sector}{s.industry && s.industry !== 'Unknown' ? ` / ${s.industry}` : ''}
            </Typography>
            <Typography variant="body2">
              Price: £{typeof s.currentPrice === 'number' ? s.currentPrice.toFixed(2) : '—'}
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: s.pctChange >= 0 ? '#00A850' : '#C0392B' }}
            >
              Change: {sign}{typeof s.pctChange === 'number' ? s.pctChange.toFixed(2) : '0.00'}%
              {changeGbp !== null ? ` (£${changeGbp})` : ''}
            </Typography>
            <Typography variant="body2">
              Value: £{typeof s.marketValue === 'number' ? s.marketValue.toFixed(2) : '—'}
            </Typography>
            <Typography variant="body2">
              Weight: {typeof s.weight === 'number' ? s.weight.toFixed(1) : '—'}%
            </Typography>
            {s.failed && (
              <Typography variant="caption" sx={{ color: '#ffa726', display: 'block', mt: 0.5 }}>
                ⚠ Live data unavailable
              </Typography>
            )}
          </Box>
        );
      })()}
    </Layout>
  );
}
