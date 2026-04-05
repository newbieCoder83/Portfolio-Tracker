import React, { useState } from 'react';
import {
  AppBar, Toolbar, Typography, Button, Box, CircularProgress, Chip, Tabs, Tab,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export default function Layout({ children, onSyncComplete, currentPage = 'dashboard', onNavigate = () => {} }) {
  const { logout, lastSync, setLastSync, environment } = useAuth();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post('/api/sync');
      setLastSync(data.lastSync);
      if (onSyncComplete) onSyncComplete();
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  const formatLastSync = () => {
    if (!lastSync) return 'Never';
    const diff = Math.floor((Date.now() - new Date(lastSync).getTime()) / 60000);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff}m ago`;
    return `${Math.floor(diff / 60)}h ${diff % 60}m ago`;
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky" sx={{ bgcolor: 'background.paper', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            Portfolio Tracker
          </Typography>
          <Chip
            label={environment === 'demo' ? 'DEMO' : 'LIVE'}
            size="small"
            color={environment === 'demo' ? 'warning' : 'success'}
            sx={{ mr: 2 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mr: 2 }}>
            Synced: {formatLastSync()}
          </Typography>
          <Button
            startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon />}
            onClick={handleSync}
            disabled={syncing}
            variant="outlined"
            size="small"
            sx={{ mr: 1 }}
          >
            {syncing ? 'Syncing...' : 'Sync Now'}
          </Button>
          <Button
            startIcon={<LogoutIcon />}
            onClick={logout}
            size="small"
            color="inherit"
          >
            Logout
          </Button>
        </Toolbar>
        <Toolbar
          variant="dense"
          disableGutters
          sx={{ px: 2, minHeight: 36, borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <Tabs
            value={currentPage}
            onChange={(_, val) => onNavigate(val)}
            textColor="inherit"
            TabIndicatorProps={{ style: { backgroundColor: '#5c6bc0' } }}
            sx={{ '& .MuiTab-root': { minHeight: 36, fontSize: '0.8rem', textTransform: 'none', minWidth: 100 } }}
          >
            <Tab label="Dashboard" value="dashboard" />
            <Tab label="Heatmap" value="heatmap" />
          </Tabs>
        </Toolbar>
      </AppBar>
      <Box sx={{ p: 3 }}>
        {children}
      </Box>
    </Box>
  );
}
