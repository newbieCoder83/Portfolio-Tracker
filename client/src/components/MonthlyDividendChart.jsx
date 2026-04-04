import React, { useMemo, useState } from 'react';
import { Card, CardContent, Typography, Box, Button, LinearProgress } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function MonthlyDividendChart({ dividends }) {
  const [selectedMonth, setSelectedMonth] = useState(null);

  const monthlyData = useMemo(() => {
    if (!dividends || dividends.length === 0) return [];
    const byMonth = {};
    dividends.forEach((d) => {
      if (!d.paid_on) return;
      const month = d.paid_on.slice(0, 7); // YYYY-MM
      if (!byMonth[month]) byMonth[month] = { month, total: 0, companies: {} };
      byMonth[month].total += d.amount || 0;
      const name = d.instrument_name || d.ticker;
      byMonth[month].companies[name] = (byMonth[month].companies[name] || 0) + (d.amount || 0);
    });
    return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
  }, [dividends]);

  const drillDown = useMemo(() => {
    if (!selectedMonth) return null;
    const entry = monthlyData.find((m) => m.month === selectedMonth);
    if (!entry) return null;
    return Object.entries(entry.companies)
      .map(([name, amount]) => ({ name, amount, pct: entry.total > 0 ? (amount / entry.total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [selectedMonth, monthlyData]);

  if (!dividends || dividends.length === 0) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Monthly Dividends</Typography>
          <Typography color="text.secondary">No dividend history.</Typography>
        </CardContent>
      </Card>
    );
  }

  const handleBarClick = (data) => {
    if (data && data.activePayload && data.activePayload[0]) {
      setSelectedMonth(data.activePayload[0].payload.month);
    }
  };

  if (drillDown) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => setSelectedMonth(null)}
              size="small"
              sx={{ mr: 1 }}
            >
              Back
            </Button>
            <Typography variant="h6">{selectedMonth} Breakdown</Typography>
          </Box>
          {drillDown.map((item) => (
            <Box key={item.name} sx={{ mb: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2">{item.name}</Typography>
                <Typography variant="body2" fontWeight={600}>
                  {item.amount.toLocaleString('en-GB', { minimumFractionDigits: 2 })} ({item.pct.toFixed(1)}%)
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={item.pct}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  bgcolor: 'rgba(255,255,255,0.05)',
                  '& .MuiLinearProgress-bar': { bgcolor: '#66bb6a', borderRadius: 4 },
                }}
              />
            </Box>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>Monthly Dividends</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Click a bar to see company breakdown
        </Typography>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={monthlyData} onClick={handleBarClick} style={{ cursor: 'pointer' }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#666" />
            <YAxis tick={{ fontSize: 11 }} stroke="#666" />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
              formatter={(v) => [v.toLocaleString('en-GB', { minimumFractionDigits: 2 }), 'Dividends']}
            />
            <Bar dataKey="total" fill="#66bb6a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
