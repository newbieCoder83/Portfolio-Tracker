import React, { useMemo } from 'react';
import { Card, CardContent, Typography } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function DividendsByCompany({ dividends }) {
  const data = useMemo(() => {
    if (!dividends || dividends.length === 0) return [];
    const byCompany = {};
    dividends.forEach((d) => {
      const name = d.instrument_name || d.ticker || 'Unknown';
      byCompany[name] = (byCompany[name] || 0) + (d.amount || 0);
    });
    return Object.entries(byCompany)
      .map(([name, total]) => ({ name: name.length > 20 ? name.slice(0, 20) + '...' : name, total: Math.round(total * 100) / 100, fullName: name }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
  }, [dividends]);

  if (data.length === 0) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Dividends by Company</Typography>
          <Typography color="text.secondary">No dividend data.</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>Dividends by Company</Typography>
        <ResponsiveContainer width="100%" height={Math.max(280, data.length * 28)}>
          <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis type="number" tick={{ fontSize: 11 }} stroke="#666" />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} stroke="#666" width={120} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
              formatter={(v, _, props) => [v.toLocaleString('en-GB', { minimumFractionDigits: 2 }), props.payload.fullName]}
            />
            <Bar dataKey="total" fill="#26c6da" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
