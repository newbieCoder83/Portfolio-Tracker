import React from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = [
  '#5c6bc0', '#26c6da', '#66bb6a', '#ffa726', '#ef5350',
  '#ab47bc', '#42a5f5', '#ec407a', '#8d6e63', '#78909c',
  '#d4e157', '#29b6f6', '#ff7043', '#9ccc65', '#26a69a',
];

export default function AllocationPieChart({ positions }) {
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
  const data = positions
    .filter((p) => p.wallet_current_value > 0)
    .map((p) => ({
      name: p.instrument_name || p.ticker,
      value: p.wallet_current_value,
      pct: total > 0 ? ((p.wallet_current_value / total) * 100).toFixed(1) : 0,
    }))
    .sort((a, b) => b.value - a.value);

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

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>Portfolio Allocation</Typography>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              outerRadius={110}
              innerRadius={60}
              dataKey="value"
              label={({ name, pct }) => `${name.length > 12 ? name.slice(0, 12) + '...' : name} ${pct}%`}
              labelLine={false}
              style={{ fontSize: 10 }}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
