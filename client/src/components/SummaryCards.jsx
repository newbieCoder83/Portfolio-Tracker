import React from 'react';
import { Grid, Card, CardContent, Typography, Box } from '@mui/material';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import SavingsIcon from '@mui/icons-material/Savings';
import PaidIcon from '@mui/icons-material/Paid';

function StatCard({ title, value, icon, color, prefix = '' }) {
  const isNegative = typeof value === 'number' && value < 0;
  const displayColor = color || (isNegative ? 'error.main' : 'success.main');

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
              {title}
            </Typography>
            <Typography variant="h5" sx={{ mt: 0.5, color: color ? displayColor : 'text.primary', fontWeight: 700 }}>
              {prefix}{typeof value === 'number' ? value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
            </Typography>
          </Box>
          <Box sx={{ color: displayColor, opacity: 0.7 }}>
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function SummaryCards({ summary, totalDividends }) {
  if (!summary) return null;

  const plColor = summary.invest_unrealized_pl >= 0 ? 'success.main' : 'error.main';
  const plPrefix = summary.invest_unrealized_pl >= 0 ? '+' : '';
  const currency = summary.currency || 'GBP';
  const sym = currency === 'GBP' ? '\u00A3' : currency === 'EUR' ? '\u20AC' : '$';

  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      <Grid item xs={12} sm={6} md={2.4}>
        <StatCard
          title="Total Value"
          value={summary.total_value}
          icon={<AccountBalanceWalletIcon />}
          color="primary.main"
          prefix={sym}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={2.4}>
        <StatCard
          title="Invested"
          value={summary.invest_total_cost}
          icon={<TrendingUpIcon />}
          color="secondary.main"
          prefix={sym}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={2.4}>
        <StatCard
          title="Unrealised P/L"
          value={summary.invest_unrealized_pl}
          icon={<ShowChartIcon />}
          color={plColor}
          prefix={plPrefix + sym}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={2.4}>
        <StatCard
          title="Free Cash"
          value={summary.cash_available_to_trade}
          icon={<SavingsIcon />}
          color="text.secondary"
          prefix={sym}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={2.4}>
        <StatCard
          title="Total Dividends"
          value={totalDividends}
          icon={<PaidIcon />}
          color="#66bb6a"
          prefix={sym}
        />
      </Grid>
    </Grid>
  );
}
