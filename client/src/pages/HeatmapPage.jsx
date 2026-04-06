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

// Label queue — filled during Recharts render pass, drawn in overlay SVG
let _labelQueue = [];

// Custom SVG renderer for each treemap tile.
// Recharts adds an invisible root at depth 0.
// depth 1 = sector, depth 2 = industry, depth 3 = stock tile.
function CustomContent(props) {
  const {
    x, y, width, height, depth, name,
    ticker, pctChange, failed, onTileMouseEnter, onTileMouseLeave,
  } = props;

  // depth 0: invisible Recharts root
  if (depth === 0) {
    return <g />;
  }

  // depth 1: Sector block — render rect only, queue label for overlay
  if (depth === 1) {
    if (width > 50 && height > 24) {
      _labelQueue.push({ type: 'sector', x, y, width, name });
    }
    return (
      <g>
        <rect x={x} y={y} width={width} height={height}
          fill="rgba(255,255,255,0.03)" stroke="#ffffff" strokeWidth={2} />
      </g>
    );
  }

  // depth 2: Industry sub-block — render rect only, queue label for overlay
  if (depth === 2) {
    if (width > 80 && height > 30) {
      _labelQueue.push({ type: 'industry', x, y, width, name });
    }
    return (
      <g>
        <rect x={x} y={y} width={width} height={height}
          fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      </g>
    );
  }

  // depth 3: Stock tile
  const bgColor = getPctColor(pctChange, failed);
  const sign = (pctChange >= 0) ? '+' : '';
  const cleanTicker = (ticker || name)
    .replace(/_US_EQ$/, '')
    .replace(/_EQ$/, '')
    .replace(/l$/, '');
  const label = (name && name !== ticker) ? name : cleanTicker;

  const showText = width >= 40 && height >= 28;
  const displayLabel = width > 80 ? label : (width >= 40 ? cleanTicker : null);
  const clipId = `clip-${depth}-${x}-${y}`;

  return (
    <g
      onMouseEnter={(e) => onTileMouseEnter && onTileMouseEnter(e, props)}
      onMouseLeave={() => onTileMouseLeave && onTileMouseLeave()}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={x + 2} y={y + 2} width={Math.max(0, width - 4)} height={Math.max(0, height - 4)} />
        </clipPath>
      </defs>
      <rect
        x={x} y={y} width={width} height={height}
        fill={bgColor}
        stroke="#0d1117"
        strokeWidth={2}
        style={{ cursor: 'default' }}
      />
      <g clipPath={`url(#${clipId})`}>
        {showText && displayLabel && (
          <text
            x={x + width / 2}
            y={y + height / 2 - (height > 52 ? 10 : 0)}
            textAnchor="middle"
            fill="white"
            fontSize={Math.min(14, Math.floor(width / 5))}
            fontWeight={700}
            dominantBaseline="middle"
            textLength={displayLabel.length * 8 > width - 16 ? Math.max(0, width - 16) : undefined}
            lengthAdjust="spacingAndGlyphs"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {displayLabel}
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
    () => (data?.sectors ?? [])
      .flatMap(s => s.industries ?? [])
      .flatMap(i => i.stocks ?? [])
      .reduce((sum, s) => sum + s.marketValue, 0),
    [data]
  );

  // Build nested Recharts Treemap data: [{ name: sector, children: [...stocks] }]
  const treemapData = useMemo(() => {
    _labelQueue = [];
    if (!data?.sectors?.length) return [];
    return data.sectors.map(sector => ({
      name: sector.name,
      children: sector.industries.map(industry => ({
        name: industry.name,
        children: industry.stocks.map(stock => ({
          name: stock.ticker,
          size: stock.marketValue,
          fill: getPctColor(stock.pctChange, stock.failed),
          ...stock,
          weight: totalValue > 0 ? (stock.marketValue / totalValue) * 100 : 0,
        })),
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
        <Box sx={{ bgcolor: '#0d1117', borderRadius: 1, p: 1, position: 'relative' }}>
          <Typography variant="h5" sx={{ mb: 2, fontWeight: 700, color: '#fff' }}>
            Portfolio Heatmap
          </Typography>

          <Box sx={{ position: 'relative', width: '95%', mx: 'auto' }}>
            <ResponsiveContainer width="100%" height={608}>
              <Treemap
                data={treemapData}
                dataKey="size"
                aspectRatio={4 / 3}
                content={contentElement}
                isAnimationActive={false}
              />
            </ResponsiveContainer>
            {/* Label overlay — painted after Recharts SVG, always on top */}
            <svg
              style={{
                position: 'absolute', top: 0, left: 0,
                width: '100%', height: '100%',
                pointerEvents: 'none',
              }}
            >
              {_labelQueue.map((lbl, i) => lbl.type === 'sector' ? (
                <g key={i}>
                  <rect x={lbl.x} y={lbl.y} width={lbl.width} height={24}
                    fill="rgba(0,0,0,0.65)" />
                  <text x={lbl.x + 6} y={lbl.y + 16}
                    fill="#ffffff" fontSize={11} fontWeight={700}
                    style={{ userSelect: 'none' }}>
                    {lbl.name.toUpperCase()}
                  </text>
                </g>
              ) : (
                <text key={i} x={lbl.x + 4} y={lbl.y + 11}
                  fill="#888888" fontSize={9} fontStyle="italic"
                  style={{ userSelect: 'none' }}>
                  {lbl.name}
                </text>
              ))}
            </svg>
          </Box>
        </Box>
      )}

      {/* Floating tooltip — rendered outside SVG so it isn't clipped */}
      {tooltip && (() => {
        const s = tooltip.stock;
        const sign = (s.pctChange >= 0) ? '+' : '';
        const changeGbp = s.currentPrice && s.pctChange != null
          ? (s.currentPrice * s.pctChange / 100).toFixed(2)
          : null;
        const tooltipX = Math.min(tooltip.x + 12, window.innerWidth - 260);
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
              maxWidth: 260,
            }}
          >
            <Typography variant="body2" fontWeight={700} sx={{ mb: 0.25 }}>
              {s.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
              {s.sector}{s.industry ? ` / ${s.industry}` : ''}
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
              Portfolio Value: £{typeof s.marketValue === 'number' ? s.marketValue.toFixed(2) : '—'}
            </Typography>
            <Typography variant="body2">
              Portfolio Weight: {typeof s.weight === 'number' ? s.weight.toFixed(1) : '—'}%
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
