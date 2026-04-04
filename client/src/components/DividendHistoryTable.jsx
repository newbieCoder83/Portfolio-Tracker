import React from 'react';
import { Card, CardContent, Typography, TableContainer, Table, TableHead, TableBody, TableRow, TableCell } from '@mui/material';

export default function DividendHistoryTable({ dividends }) {
  if (!dividends || dividends.length === 0) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Dividend History</Typography>
          <Typography color="text.secondary">No dividends recorded.</Typography>
        </CardContent>
      </Card>
    );
  }

  const fmt = (v) => typeof v === 'number'
    ? v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : '—';

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>Dividend History</Typography>
        <TableContainer sx={{ maxHeight: 400 }}>
          <Table size="small" stickyHeader sx={{ '& td, & th': { fontSize: '0.8rem' } }}>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Company</TableCell>
                <TableCell align="right">Shares</TableCell>
                <TableCell align="right">Per Share</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell>Type</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {dividends.map((d) => (
                <TableRow key={d.reference} hover>
                  <TableCell>{d.paid_on}</TableCell>
                  <TableCell>{d.instrument_name || d.ticker}</TableCell>
                  <TableCell align="right">{fmt(d.quantity)}</TableCell>
                  <TableCell align="right">{fmt(d.gross_amount_per_share)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: '#66bb6a' }}>
                    {fmt(d.amount)}
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary', textTransform: 'lowercase' }}>
                    {d.type}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}
