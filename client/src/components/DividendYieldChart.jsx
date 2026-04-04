import React, { useMemo } from 'react';
import { Card, CardContent, Typography } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function DividendYieldChart({ positions, dividends }) {
  const data = useMemo(() => {
    if (!positions || positions.length === 0) return [];

    // Annualized dividends per ticker
    const divByTicker = {};
    const dateRange = { min: null, max: null };
    (dividends || []).forEach((d) => {
      if (!d.paid_on) return;
      divByTicker[d.ticker] = (divByTicker[d.ticker] || 0) + (d.amount || 0);
      if (!dateRange.min || d.paid_on < dateRange.min) dateRange.min = d.paid_on;
      if (!dateRange.max || d.paid_on > dateRange.max) dateRange.max = d.paid_on;
    });

    // Calculate annualization factor
    let years = 1;
    if (dateRange.min && dateRange.max) {
      const ms = new Date(dateRange.max) - new Date(dateRange.min);
      years = Math.max(ms / (365.25 * 24 * 60 * 60 * 1000), 1 / 12); // At least 1 month
    }

    return positions
      .filter((p) => p.wallet_total_cost > 0 && divByTicker[p.ticker])
      .map((p) => {
        const annualDiv = (divByTicker[p.ticker] || 0) / years;
        const yld = (annualDiv / p.wallet_total_cost) * 100;
        return {
          name: (p.instrument_name || p.ticker).slice(0, 18),
          yield: Math.round(yld * 100) / 100,
        };
      })
      .sort((a, b) => b.yield - a.yield);
  }, [positions, dividends]);

  if (data.length === 0) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Dividend Yield by Position</Typography>
          <Typography color="text.secondary">No yield data available.</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>Dividend Yield by Position</Typography>
        <ResponsiveContainer width="100%" height={Math.max(250, data.length * 30)}>
          <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis type="number" tick={{ fontSize: 11 }} stroke="#666" tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} stroke="#666" width={110} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
              formatter={(v) => [`${v.toFixed(2)}%`, 'Yield']}
            />
            <Bar dataKey="yield" fill="#ffa726" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
