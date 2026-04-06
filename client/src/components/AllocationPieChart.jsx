import React, { useState } from 'react';
import {
  Card, CardContent, Typography, Box, Dialog, DialogTitle,
  DialogContent, IconButton, Divider, List, ListItemButton, ListItemText,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Sector } from 'recharts';

const COLORS = [
  '#5c6bc0', '#26c6da', '#66bb6a', '#ffa726', '#ef5350',
  '#ab47bc', '#42a5f5', '#ec407a', '#8d6e63', '#78909c',
  '#d4e157', '#29b6f6', '#ff7043', '#9ccc65', '#26a69a',
];

const THRESHOLD = 0.015;

export default function AllocationPieChart({ positions }) {
  const [selectedSlice, setSelectedSlice] = useState(null);
  const [otherExpanded, setOtherExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(null);

  if (!positions || positions.length === 0) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Portfolio Allocation</Typography>
          <Typography color="text.secondary">No positions to display</Typography>
        </CardContent>
      </Card>
    );
  }

  const total = positions.reduce((s, p) => s + (p.wallet_current_value || 0), 0);

  const mainPositions = positions.filter(
    (p) => p.wallet_current_value > 0 && p.wallet_current_value / total >= THRESHOLD
  );
  const smallPositions = positions.filter(
    (p) => p.wallet_current_value > 0 && p.wallet_current_value / total < THRESHOLD
  );

  const data = mainPositions
    .map((p) => ({
      name: p.instrument_name || p.ticker,
      value: p.wallet_current_value,
      pct: total > 0 ? ((p.wallet_current_value / total) * 100).toFixed(1) : 0,
      raw: p,
    }))
    .sort((a, b) => b.value - a.value);

  if (smallPositions.length > 0) {
    const otherValue = smallPositions.reduce((s, p) => s + p.wallet_current_value, 0);
    data.push({
      name: `Other (${smallPositions.length} holdings)`,
      value: otherValue,
      pct: total > 0 ? ((otherValue / total) * 100).toFixed(1) : 0,
      isOther: true,
      holdings: smallPositions,
    });
  }

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload[0]) return null;
    const d = payload[0].payload;
    return (
      <Box sx={{ bgcolor: 'background.paper', p: 1.5, borderRadius: 1, border: '1px solid rgba(255,255,255,0.1)' }}>
        <Typography variant="body2" fontWeight={600}>{d.name}</Typography>
        <Typography variant="body2" color="text.secondary">
          {d.value.toLocaleString('en-GB', { minimumFractionDigits: 2 })} ({d.pct}%)
        </Typography>
      </Box>
    );
  };

  const handleSliceClick = (data) => {
    if (data.isOther) {
      setOtherExpanded(true);
      setSelectedSlice(null);
    } else {
      setSelectedSlice(data);
      setOtherExpanded(false);
    }
  };

  const renderActiveShape = (props) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
      <g style={{ filter: 'drop-shadow(0 0 6px rgba(0,0,0,0.4))' }}>
        <Sector
          cx={cx} cy={cy}
          innerRadius={innerRadius - 3}
          outerRadius={outerRadius + 10}
          startAngle={startAngle} endAngle={endAngle}
          fill={fill}
        />
      </g>
    );
  };

  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({ cx, cy, midAngle, outerRadius, fill, index, name, pct }) => {
    if (index === activeIndex) return null;

    const sin = Math.sin(-RADIAN * midAngle);
    const cos = Math.cos(-RADIAN * midAngle);
    const sx = cx + outerRadius * cos;
    const sy = cy + outerRadius * sin;
    const mx = cx + (outerRadius + 20) * cos;
    const my = cy + (outerRadius + 20) * sin;
    const ex = mx + (cos >= 0 ? 1 : -1) * 16;
    const ey = my;
    const textAnchor = cos >= 0 ? 'start' : 'end';
    const textX = ex + (cos >= 0 ? 6 : -6);

    return (
      <g>
        <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} strokeWidth={1} fill="none" opacity={0.7} />
        <circle cx={ex} cy={ey} r={2} fill={fill} />
        <text x={textX} y={ey} fontSize={10} textAnchor={textAnchor} dominantBaseline="central" fill={fill}>
          {`${name.length > 14 ? name.slice(0, 14) + '\u2026' : name} ${pct}%`}
        </text>
      </g>
    );
  };

  const formatGbp = (val) =>
    typeof val === 'number'
      ? '£' + val.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '—';

  // Position detail dialog content
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
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>Portfolio Allocation</Typography>
        <ResponsiveContainer width="100%" height={380}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              outerRadius={95}
              innerRadius={52}
              dataKey="value"
              label={renderCustomizedLabel}
              labelLine={false}
              style={{ cursor: 'pointer' }}
              onClick={handleSliceClick}
              activeIndex={activeIndex}
              activeShape={renderActiveShape}
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>

      {/* Position detail dialog */}
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

      {/* Other holdings drill-down dialog */}
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
                      secondary={`${formatGbp(p.wallet_current_value)}  ·  ${weight}%`}
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
