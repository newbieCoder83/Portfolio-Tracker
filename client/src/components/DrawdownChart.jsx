import React, { useMemo } from 'react';
import { Card, CardContent, Typography, Box, Grid } from '@mui/material';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function DrawdownChart({ snapshots }) {
  const { data, maxDrawdown, currentDrawdown } = useMemo(() => {
    if (!snapshots || snapshots.length === 0) {
      return { data: [], maxDrawdown: 0, currentDrawdown: 0 };
    }

    let peak = 0;
    let maxDd = 0;
    const data = snapshots.map((s) => {
      const val = s.total_value || 0;
      if (val > peak) peak = val;
      const dd = peak > 0 ? ((val - peak) / peak) * 100 : 0;
      if (dd < maxDd) maxDd = dd;
      return { date: s.date, drawdown: Math.round(dd * 100) / 100 };
    });

    const currentDd = data.length > 0 ? data[data.length - 1].drawdown : 0;
    return { data, maxDrawdown: maxDd, currentDrawdown: currentDd };
  }, [snapshots]);

  if (data.length === 0) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Drawdown</Typography>
          <Typography color="text.secondary">No snapshot data yet.</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>Drawdown</Typography>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#666" />
            <YAxis tick={{ fontSize: 11 }} stroke="#666" tickFormatter={(v) => `${v}%`} domain={['dataMin', 0]} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
              formatter={(v) => [`${v.toFixed(2)}%`, 'Drawdown']}
            />
            <Area type="monotone" dataKey="drawdown" stroke="#f44336" fill="rgba(244,67,54,0.2)" />
          </AreaChart>
        </ResponsiveContainer>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={6}>
            <Box sx={{ textAlign: 'center', p: 1, borderRadius: 1, bgcolor: 'rgba(244,67,54,0.1)' }}>
              <Typography variant="caption" color="text.secondary">Max Drawdown</Typography>
              <Typography variant="h6" sx={{ color: '#f44336', fontWeight: 700 }}>
                {maxDrawdown.toFixed(2)}%
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6}>
            <Box sx={{ textAlign: 'center', p: 1, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.03)' }}>
              <Typography variant="caption" color="text.secondary">Current Drawdown</Typography>
              <Typography variant="h6" sx={{ color: currentDrawdown < 0 ? '#f44336' : '#4caf50', fontWeight: 700 }}>
                {currentDrawdown.toFixed(2)}%
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}
