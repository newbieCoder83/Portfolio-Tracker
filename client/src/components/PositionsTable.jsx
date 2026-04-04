import React, { useState, useMemo } from 'react';
import { Card, CardContent, Typography, Box, TableContainer, Table, TableHead, TableBody, TableRow, TableCell, TableSortLabel } from '@mui/material';

const COLUMNS = [
  { id: 'instrument_name', label: 'Name', align: 'left' },
  { id: 'ticker', label: 'Ticker', align: 'left' },
  { id: 'quantity', label: 'Qty', align: 'right', fmt: (v) => v?.toFixed(2) },
  { id: 'average_price_paid', label: 'Avg Price', align: 'right', fmt: (v) => v?.toFixed(2) },
  { id: 'current_price', label: 'Price', align: 'right', fmt: (v) => v?.toFixed(2) },
  { id: 'wallet_total_cost', label: 'Cost', align: 'right', fmt: (v) => v?.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
  { id: 'wallet_current_value', label: 'Value', align: 'right', fmt: (v) => v?.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
  { id: 'pl', label: 'P/L', align: 'right', colored: true },
  { id: 'plPct', label: 'P/L %', align: 'right', colored: true },
  { id: 'weight', label: 'Weight %', align: 'right' },
  { id: 'divIncome', label: 'Div Income', align: 'right' },
  { id: 'yield', label: 'Yield %', align: 'right' },
];

export default function PositionsTable({ positions, dividends, totalValue }) {
  const [orderBy, setOrderBy] = useState('wallet_current_value');
  const [order, setOrder] = useState('desc');

  const rows = useMemo(() => {
    if (!positions) return [];

    // Sum dividends per ticker
    const divByTicker = {};
    (dividends || []).forEach((d) => {
      divByTicker[d.ticker] = (divByTicker[d.ticker] || 0) + (d.amount || 0);
    });

    return positions.map((p) => {
      const cost = p.wallet_total_cost || 0;
      const value = p.wallet_current_value || 0;
      const pl = p.wallet_unrealized_pl || 0;
      const plPct = cost > 0 ? (pl / cost) * 100 : 0;
      const weight = totalValue > 0 ? (value / totalValue) * 100 : 0;
      const divIncome = divByTicker[p.ticker] || p.dividend_income || 0;
      const yld = cost > 0 ? (divIncome / cost) * 100 : 0;

      return { ...p, pl, plPct, weight, divIncome, yield: yld };
    });
  }, [positions, dividends, totalValue]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aVal = a[orderBy] ?? 0;
      const bVal = b[orderBy] ?? 0;
      if (typeof aVal === 'string') {
        return order === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return order === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [rows, orderBy, order]);

  const handleSort = (col) => {
    if (orderBy === col) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setOrderBy(col);
      setOrder('desc');
    }
  };

  const fmtNum = (v, dp = 2) =>
    typeof v === 'number' ? v.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : '—';

  const plColor = (v) => (v >= 0 ? '#4caf50' : '#f44336');

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>Positions</Typography>
        <TableContainer>
          <Table size="small" sx={{ '& td, & th': { fontSize: '0.8rem', whiteSpace: 'nowrap' } }}>
            <TableHead>
              <TableRow>
                {COLUMNS.map((col) => (
                  <TableCell key={col.id} align={col.align}>
                    <TableSortLabel
                      active={orderBy === col.id}
                      direction={orderBy === col.id ? order : 'asc'}
                      onClick={() => handleSort(col.id)}
                    >
                      {col.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((row) => (
                <TableRow key={row.ticker} hover>
                  <TableCell>{row.instrument_name}</TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{row.ticker}</TableCell>
                  <TableCell align="right">{fmtNum(row.quantity)}</TableCell>
                  <TableCell align="right">{fmtNum(row.average_price_paid)}</TableCell>
                  <TableCell align="right">{fmtNum(row.current_price)}</TableCell>
                  <TableCell align="right">{fmtNum(row.wallet_total_cost)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtNum(row.wallet_current_value)}</TableCell>
                  <TableCell align="right" sx={{ color: plColor(row.pl), fontWeight: 600 }}>
                    {row.pl >= 0 ? '+' : ''}{fmtNum(row.pl)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: plColor(row.plPct) }}>
                    {row.plPct >= 0 ? '+' : ''}{fmtNum(row.plPct)}%
                  </TableCell>
                  <TableCell align="right">{fmtNum(row.weight, 1)}%</TableCell>
                  <TableCell align="right">{fmtNum(row.divIncome)}</TableCell>
                  <TableCell align="right">{fmtNum(row.yield, 1)}%</TableCell>
                </TableRow>
              ))}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">No positions</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}
