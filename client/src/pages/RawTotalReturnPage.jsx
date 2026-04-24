import React, { useState, useEffect, useCallback } from 'react';
import { Box, CircularProgress } from '@mui/material';
import Layout from '../components/Layout';
import RawTotalReturnChart from '../components/RawTotalReturnChart';
import api from '../api/client';

export default function RawTotalReturnPage() {
  const [totalReturn, setTotalReturn] = useState(null);
  const [loading, setLoading] = useState(true);

  // initial=true triggers the full-screen spinner; subsequent refetches
  // keep the chart visible so the chart's own alert / state survives.
  const fetchData = useCallback(async ({ initial = false } = {}) => {
    if (initial) setLoading(true);
    try {
      const { data } = await api.get('/api/history/total-return-raw');
      setTotalReturn(data);
    } catch (err) {
      console.error('Failed to fetch raw total return:', err);
    } finally {
      if (initial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData({ initial: true });
  }, [fetchData]);

  if (loading) {
    return (
      <Layout onSyncComplete={fetchData}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
          <CircularProgress />
        </Box>
      </Layout>
    );
  }

  return (
    <Layout onSyncComplete={fetchData}>
      <Box sx={{ minHeight: 520 }}>
        <RawTotalReturnChart totalReturn={totalReturn} onRefreshComplete={fetchData} />
      </Box>
    </Layout>
  );
}
