import React, { useMemo } from 'react';
import { Card, CardContent, Typography, Box, Grid, Chip } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

const VUSA_ANNUAL_RETURN = 0.12; // 12% annual
const VHYL_ANNUAL_RETURN = 0.08; // 8% annual

export default function BenchmarkChart({ orders, snapshots, totalValue, totalCost }) {
  const chartData = useMemo(() => {
    if (!orders || orders.length === 0) return { data: [], vusaFinal: 0, vhylFinal: 0 };

    // Extract BUY orders with dates and amounts invested (abs of net value)
    const buyOrders = orders
      .filter((o) => o.side === 'BUY' && o.fill_wallet_net_value)
      .map((o) => ({
        date: (o.fill_filled_at || o.order_created_at || '').slice(0, 10),
        amount: Math.abs(o.fill_wallet_net_value),
      }))
      .filter((o) => o.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (buyOrders.length === 0) return { data: [], vusaFinal: 0, vhylFinal: 0 };

    const now = new Date();

    // Build a timeline from first order to today
    const firstDate = new Date(buyOrders[0].date);
    const months = [];
    const d = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
    while (d <= now) {
      months.push(new Date(d));
      d.setMonth(d.getMonth() + 1);
    }
    if (months.length === 0) months.push(now);

    // For each month, compute cumulative cost basis and simulated values
    let cumulativeCost = 0;
    let vusaValue = 0;
    let vhylValue = 0;
    let orderIdx = 0;

    const data = months.map((monthDate) => {
      const monthStr = monthDate.toISOString().slice(0, 7);
      const dateStr = monthDate.toISOString().slice(0, 10);

      // Add all orders up to this month
      while (orderIdx < buyOrders.length && buyOrders[orderIdx].date.slice(0, 7) <= monthStr) {
        const amt = buyOrders[orderIdx].amount;
        cumulativeCost += amt;
        vusaValue += amt;
        vhylValue += amt;
        orderIdx++;
      }

      // Compound existing simulated values by monthly rate
      const vusaMonthly = Math.pow(1 + VUSA_ANNUAL_RETURN, 1 / 12) - 1;
      const vhylMonthly = Math.pow(1 + VHYL_ANNUAL_RETURN, 1 / 12) - 1;
      vusaValue *= (1 + vusaMonthly);
      vhylValue *= (1 + vhylMonthly);

      // Find closest snapshot for actual portfolio value
      const snapshot = (snapshots || []).find((s) => s.date && s.date.slice(0, 7) === monthStr);
      const actual = snapshot ? snapshot.total_value : null;

      return {
        date: monthStr,
        costBasis: Math.round(cumulativeCost * 100) / 100,
        vusa: Math.round(vusaValue * 100) / 100,
        vhyl: Math.round(vhylValue * 100) / 100,
        portfolio: actual,
      };
    });

    // Set final month to actual current values
    if (data.length > 0) {
      data[data.length - 1].portfolio = totalValue || data[data.length - 1].portfolio;
    }

    return { data, vusaFinal: vusaValue, vhylFinal: vhylValue };
  }, [orders, snapshots, totalValue, totalCost]);

  const { data, vusaFinal, vhylFinal } = chartData;

  if (data.length === 0) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Benchmark Comparison</Typography>
          <Typography color="text.secondary">No order history to compute benchmarks.</Typography>
        </CardContent>
      </Card>
    );
  }

  const costBasis = data[data.length - 1]?.costBasis || 0;
  const fmt = (v) => v.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const pct = (v) => costBasis > 0 ? (((v - costBasis) / costBasis) * 100).toFixed(1) : '0';

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>Benchmark Comparison</Typography>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#666" />
            <YAxis tick={{ fontSize: 11 }} stroke="#666" tickFormatter={(v) => v.toLocaleString()} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
              formatter={(v) => v !== null ? v.toLocaleString('en-GB', { minimumFractionDigits: 2 }) : 'N/A'}
            />
            <Legend />
            <Line type="monotone" dataKey="costBasis" name="Cost Basis" stroke="#78909c" strokeWidth={2} dot={false} strokeDasharray="5 5" />
            <Line type="monotone" dataKey="portfolio" name="Portfolio" stroke="#5c6bc0" strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="vusa" name="VUSA (12%/yr)" stroke="#66bb6a" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="vhyl" name="VHYL (8%/yr)" stroke="#ffa726" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
        <Grid container spacing={1} sx={{ mt: 1 }}>
          <Grid item xs={3}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">Cost Basis</Typography>
              <Typography variant="body2" fontWeight={600}>{fmt(costBasis)}</Typography>
            </Box>
          </Grid>
          <Grid item xs={3}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">Portfolio</Typography>
              <Typography variant="body2" fontWeight={600} sx={{ color: '#5c6bc0' }}>
                {fmt(totalValue)} ({pct(totalValue)}%)
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={3}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">VUSA Sim</Typography>
              <Typography variant="body2" fontWeight={600} sx={{ color: '#66bb6a' }}>
                {fmt(vusaFinal)} ({pct(vusaFinal)}%)
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={3}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">VHYL Sim</Typography>
              <Typography variant="body2" fontWeight={600} sx={{ color: '#ffa726' }}>
                {fmt(vhylFinal)} ({pct(vhylFinal)}%)
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}
