import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, CircularProgress, Grid } from '@mui/material';
import Layout from '../components/Layout';
import SummaryCards from '../components/SummaryCards';
import AllocationPieChart from '../components/AllocationPieChart';
import PositionsTable from '../components/PositionsTable';
import BenchmarkChart from '../components/BenchmarkChart';
import DrawdownChart from '../components/DrawdownChart';
import MonthlyDividendChart from '../components/MonthlyDividendChart';
import DividendsByCompany from '../components/DividendsByCompany';
import DividendYieldChart from '../components/DividendYieldChart';
import DividendHistoryTable from '../components/DividendHistoryTable';
import PortfolioValueChart from '../components/PortfolioValueChart';
import api from '../api/client';

export default function DashboardPage() {
  const [data, setData] = useState({
    summary: null,
    positions: [],
    dividends: [],
    orders: [],
    snapshots: [],
  });
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [summaryRes, positionsRes, dividendsRes, ordersRes, snapshotsRes] = await Promise.all([
        api.get('/api/account/summary'),
        api.get('/api/portfolio/positions'),
        api.get('/api/history/dividends'),
        api.get('/api/history/orders'),
        api.get('/api/sync/snapshots'),
      ]);
      setData({
        summary: summaryRes.data,
        positions: positionsRes.data || [],
        dividends: dividendsRes.data || [],
        orders: ordersRes.data || [],
        snapshots: snapshotsRes.data || [],
      });
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const totalDividends = data.dividends.reduce((sum, d) => sum + (d.amount || 0), 0);

  if (loading) {
    return (
      <Layout onSyncComplete={fetchAll} >
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
          <CircularProgress />
        </Box>
      </Layout>
    );
  }

  return (
    <Layout onSyncComplete={fetchAll} >
      <SummaryCards summary={data.summary} totalDividends={totalDividends} />

      {/* Row 1: Allocation pie + Portfolio value chart */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={5}>
          <AllocationPieChart positions={data.positions} />
        </Grid>
        <Grid item xs={12} md={7}>
          <PortfolioValueChart snapshots={data.snapshots} />
        </Grid>
      </Grid>

      {/* Row 2: Positions table */}
      <Box sx={{ mb: 3 }}>
        <PositionsTable
          positions={data.positions}
          dividends={data.dividends}
          totalValue={data.summary?.total_value || 0}
        />
      </Box>

      {/* Row 3: Benchmark + Drawdown */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={7}>
          <BenchmarkChart
            orders={data.orders}
            snapshots={data.snapshots}
            totalValue={data.summary?.total_value || 0}
            totalCost={data.summary?.invest_total_cost || 0}
          />
        </Grid>
        <Grid item xs={12} md={5}>
          <DrawdownChart snapshots={data.snapshots} />
        </Grid>
      </Grid>

      {/* Row 4: Monthly dividends + By company */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={7}>
          <MonthlyDividendChart dividends={data.dividends} />
        </Grid>
        <Grid item xs={12} md={5}>
          <DividendsByCompany dividends={data.dividends} />
        </Grid>
      </Grid>

      {/* Row 5: Dividend yield + History table */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={5}>
          <DividendYieldChart positions={data.positions} dividends={data.dividends} />
        </Grid>
        <Grid item xs={12} md={7}>
          <DividendHistoryTable dividends={data.dividends} />
        </Grid>
      </Grid>
    </Layout>
  );
}
