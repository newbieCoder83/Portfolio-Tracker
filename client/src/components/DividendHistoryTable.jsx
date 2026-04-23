import React, { useMemo } from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';
import HighchartsGrid from './HighchartsGrid';
import { dividendAmountCellFormatter } from '../utils/highchartsUtils';

// Keep the column definitions in one place so the Grid setup stays readable.

const COLUMNS = [
  { id: 'paid_on', label: 'Date', align: 'left', formatter: dividendDateCellFormatter, defaultSort: 'desc' },
  { id: 'company', label: 'Company', align: 'left' },
  { id: 'quantity', label: 'Shares', align: 'right', dataType: 'number', formatter: dividendAmountCellFormatter },
  { id: 'gross_amount_per_share', label: 'Per Share', align: 'right', dataType: 'number', formatter: dividendAmountCellFormatter },
  {
    id: 'amount',
    label: 'Total',
    align: 'right',
    dataType: 'number',
    formatter: dividendAmountCellFormatter,
    emphasis: true,
    color: '#66bb6a',
  },
  {
    id: 'type',
    label: 'Type',
    align: 'left',
    tone: 'secondary',
    textTransform: 'lowercase',
  },
];

function dividendDateCellFormatter() {
  // Trading 212 now documents this as a timestamp, but the UI only wants YYYY-MM-DD.
  if (!this.value) {
    return '—';
  }

  return String(this.value).slice(0, 10);
}

function buildColumnOptions(column) {
  // Convert our lightweight column metadata into the shape Highcharts Grid expects.
  return {
    id: column.id,
    ...(column.dataType ? { dataType: column.dataType } : {}),
    header: {
      format: column.label,
      style: { textAlign: column.align },
    },
    cells: {
      ...(column.formatter ? { formatter: column.formatter } : {}),
      style: {
        textAlign: column.align,
        ...(column.tone === 'secondary' ? { color: '#9e9e9e' } : {}),
        ...(column.emphasis ? { fontWeight: 600 } : {}),
        ...(column.color ? { color: column.color } : {}),
        ...(column.textTransform ? { textTransform: column.textTransform } : {}),
      },
    },
    ...(column.defaultSort ? { sorting: { order: column.defaultSort } } : {}),
  };
}

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

  // Grid data is column-oriented, so each key maps to an array of cell values.
  const columnData = useMemo(() => ({
    paid_on: dividends.map((d) => d.paid_on ?? ''),
    company: dividends.map((d) => d.instrument_name || d.ticker || ''),
    quantity: dividends.map((d) => d.quantity ?? null),
    gross_amount_per_share: dividends.map((d) => d.gross_amount_per_share ?? null),
    amount: dividends.map((d) => d.amount ?? null),
    type: dividends.map((d) => d.type ?? ''),
  }), [dividends]);

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
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h6" gutterBottom>Dividend History</Typography>
        {/* Let the grid fill the available card area instead of staying at a small fixed height. */}
        <Box
          sx={{
            flex: 1,
            minHeight: 400,
            '& > div': {
              height: '100%',
            },
          }}
        >
          <HighchartsGrid options={gridOptions} />
        </Box>
      </CardContent>
    </Card>
  );
}
