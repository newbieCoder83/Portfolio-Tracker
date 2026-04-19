import React, { useState } from 'react';
import {
  Box, Card, CardContent, Typography, TextField, Button,
  MenuItem, Select, FormControl, InputLabel, Alert, CircularProgress,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [environment, setEnvironment] = useState('live');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(apiKey, apiSecret, environment);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0e17 0%, #1a1a2e 100%)',
    }}>
      <Card sx={{ maxWidth: 440, width: '100%', mx: 2, p: 1 }}>
        <CardContent>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <LockOutlinedIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
            <Typography variant="h5" gutterBottom>
              Portfolio Tracker
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Connect your Trading 212 account
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              label="API Key"
              fullWidth
              required
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              sx={{ mb: 2 }}
              autoComplete="off"
            />
            <TextField
              label="API Secret"
              fullWidth
              required
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              sx={{ mb: 2 }}
              autoComplete="off"
            />
            <FormControl fullWidth sx={{ mb: 3 }}>
              <InputLabel>Environment</InputLabel>
              <Select
                value={environment}
                label="Environment"
                onChange={(e) => setEnvironment(e.target.value)}
              >
                <MenuItem value="live">Live (Real Money)</MenuItem>
                <MenuItem value="demo">Demo (Paper Trading)</MenuItem>
              </Select>
            </FormControl>
            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading || !apiKey || !apiSecret}
              sx={{ py: 1.5 }}
            >
              {loading ? <CircularProgress size={24} /> : 'Connect & Sync'}
            </Button>
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, textAlign: 'center' }}>
            Credentials are encrypted with AES-256-GCM and stored locally only.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
