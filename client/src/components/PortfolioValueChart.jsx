import React from 'react';
import { Card, CardContent, Typography } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function PortfolioValueChart({ snapshots }) {
  if (!snapshots || snapshots.length === 0) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Portfolio Value Over Time</Typography>
          <Typography color="text.secondary">No snapshots yet. Sync daily to build history.</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>Portfolio Value Over Time</Typography>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={snapshots}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#666" />
            <YAxis tick={{ fontSize: 11 }} stroke="#666" tickFormatter={(v) => v.toLocaleString()} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
              formatter={(v) => [v.toLocaleString('en-GB', { minimumFractionDigits: 2 }), 'Value']}
            />
            <Line type="monotone" dataKey="total_value" stroke="#5c6bc0" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
