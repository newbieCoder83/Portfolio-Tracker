import React, { useMemo } from 'react';
import { Card, CardContent, Typography } from '@mui/material';
import HighchartsGrid from './HighchartsGrid';
import { currencyCellFormatter, plCellFormatter, plPercentCellFormatter } from '../utils/highchartsUtils';
import { resolveDisplayTicker } from '../utils/tickerUtils';

const COLUMNS = [
  { id: 'instrument_name', label: 'Name', align: 'left' },
  { id: 'ticker', label: 'Ticker', align: 'left', tone: 'secondary' },
  { id: 'quantity', label: 'Qty', align: 'right', format: '{value:,.2f}' },
  { id: 'average_price_paid', label: 'Avg Price', align: 'right', format: '{value:,.2f}' },
  { id: 'current_price', label: 'Price', align: 'right', format: '{value:,.2f}' },
  { id: 'wallet_total_cost', label: 'Cost', align: 'right', formatter: currencyCellFormatter },
  { id: 'wallet_current_value', label: 'Value', align: 'right', formatter: currencyCellFormatter, emphasis: true },
  { id: 'pl', label: 'P/L', align: 'right', formatter: plCellFormatter },
  { id: 'plPct', label: 'P/L %', align: 'right', formatter: plPercentCellFormatter },
  { id: 'weight', label: 'Weight %', align: 'right', format: '{value:,.1f}%' },
  { id: 'divIncome', label: 'Div Income', align: 'right', formatter: currencyCellFormatter },
  { id: 'yield', label: 'Yield %', align: 'right', format: '{value:,.1f}%' },
];

function buildColumnOptions(column) {
  return {
    id: column.id,
    header: {
      format: column.label,
      style: { textAlign: column.align },
    },
    cells: {
      ...(column.format ? { format: column.format } : {}),
      ...(column.formatter ? { formatter: column.formatter } : {}),
      style: {
        textAlign: column.align,
        ...(column.tone === 'secondary' ? { color: '#9e9e9e' } : {}),
        ...(column.emphasis ? { fontWeight: 600 } : {}),
      },
    },
    ...(column.id === 'wallet_current_value' ? { sorting: { order: 'desc' } } : {}),
  };
}

export default function PositionsTable({ positions, dividends, totalValue }) {
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

  const columnData = useMemo(() => ({
    instrument_name: rows.map((row) => row.instrument_name || ''),
    ticker: rows.map((row) => resolveDisplayTicker(row.ticker, row.instrument_name)),
    quantity: rows.map((row) => row.quantity ?? 0),
    average_price_paid: rows.map((row) => row.average_price_paid ?? 0),
    current_price: rows.map((row) => row.current_price ?? 0),
    wallet_total_cost: rows.map((row) => row.wallet_total_cost ?? 0),
    wallet_current_value: rows.map((row) => row.wallet_current_value ?? 0),
    pl: rows.map((row) => row.pl ?? 0),
    plPct: rows.map((row) => row.plPct ?? 0),
    weight: rows.map((row) => row.weight ?? 0),
    divIncome: rows.map((row) => row.divIncome ?? 0),
    yield: rows.map((row) => row.yield ?? 0),
  }), [rows]);

  const gridOptions = useMemo(() => ({
    data: {
      columns: columnData,
    },
    columnDefaults: {
      sorting: {
        enabled: true,
      },
    },
    columns: COLUMNS.map(buildColumnOptions),
  }), [columnData]);

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>Positions</Typography>
        {rows.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No positions
          </Typography>
        ) : (
          <HighchartsGrid options={gridOptions} />
        )}
      </CardContent>
    </Card>
  );
}
