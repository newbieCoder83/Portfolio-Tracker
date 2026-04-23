import React, { useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';
import { Chart, Highcharts } from '@highcharts/react';
import { Drilldown } from '@highcharts/react/options/drilldown';
import { formatCurrency, currencyYAxisConfig, getActiveVisibleSeries, getActiveVisibleSeriesLevel } from '../utils/highchartsUtils';

const monthTickFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const monthOnlyTickFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  timeZone: 'UTC',
});

function getYearDrilldownId(year) {
  return `year-${year}`;
}

function getMonthDrilldownId(monthKey) {
  return `month-${monthKey}`;
}

function truncateCategoryLabel(value) {
  const label = String(value ?? '');
  return label.length > 18 ? `${label.slice(0, 18)}...` : label;
}

function parseMonthToUtc(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number);

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return null;
  }

  return Date.UTC(year, month - 1, 1);
}

function formatMonthLabel(value) {
  const timestamp = Number(value);

  if (!Number.isFinite(timestamp)) {
    return String(value ?? '');
  }

  return monthTickFormatter.format(new Date(timestamp));
}

function buildYearXAxisConfig() {
  return {
    type: 'category',
    labels: {
      rotation: 0,
      autoRotation: undefined,
      style: { fontSize: '11px' },
      formatter() {
        const activeSeries = getActiveVisibleSeries(this.axis.chart);
        const label = activeSeries?.points?.[this.pos]?.name ?? this.axis.categories?.[this.pos] ?? this.value;
        return String(label ?? '');
      },
    },
  };
}

function buildMonthXAxisConfig() {
  return {
    type: 'datetime',
    tickPositioner() {
      const activeSeries = getActiveVisibleSeries(this.chart);
      const positions = activeSeries?.points
        ?.map((point) => point.x)
        .filter((value) => Number.isFinite(value)) ?? [];

      return positions.length > 0 ? positions : this.tickPositions;
    },
    labels: {
      rotation: 0,
      autoRotation: undefined,
      style: { fontSize: '11px' },
      formatter() {
        const timestamp = Number(this.value);

        if (!Number.isFinite(timestamp)) {
          return String(this.value ?? '');
        }

        return monthOnlyTickFormatter.format(new Date(timestamp));
      },
    },
  };
}

function buildCompanyXAxisConfig() {
  return {
    type: 'category',
    labels: {
      rotation: -45,
      autoRotation: undefined,
      style: { fontSize: '10px' },
      formatter() {
        const activeSeries = getActiveVisibleSeries(this.axis.chart);
        const label = activeSeries?.points?.[this.pos]?.name ?? this.axis.categories?.[this.pos] ?? this.value;
        return truncateCategoryLabel(label);
      },
    },
  };
}

function getXAxisConfigForLevel(level) {
  if (level === 'month') {
    return buildMonthXAxisConfig();
  }

  if (level === 'company') {
    return buildCompanyXAxisConfig();
  }

  return buildYearXAxisConfig();
}

function monthlyDividendTooltipFormatter() {
  const point = this.point;
  const amount = Number(point?.y ?? 0);

  if (point?.options?.drilldown) {
    const label = point?.options?.custom?.label || point?.name;
    return `${label}<br/><b>${formatCurrency(amount)}</b>`;
  }

  const fullName = point?.options?.custom?.fullName || point?.name || 'Unknown';
  const pct = point?.options?.custom?.pct;
  const pctText = Number.isFinite(pct) ? ` (${pct.toFixed(1)}%)` : '';

  return `${fullName}<br/><b>${formatCurrency(amount)}</b>${pctText}`;
}

export default function MonthlyDividendChart({ dividends }) {
  const chartRef = useRef(null);
  const chartWrapperRef = useRef(null);
  const lastAppliedAxisStateRef = useRef(null);

  const { yearlySeriesData, drilldownSeries } = useMemo(() => {
    if (!dividends || dividends.length === 0) {
      return { yearlySeriesData: [], drilldownSeries: [] };
    }

    const byYear = {};

    dividends.forEach((dividend) => {
      if (!dividend.paid_on) {
        return;
      }

      const month = dividend.paid_on.slice(0, 7);
      const year = month.slice(0, 4);
      const monthStartUtc = parseMonthToUtc(month);
      if (monthStartUtc === null) {
        return;
      }

      const amount = Number(dividend.amount ?? 0);
      if (!Number.isFinite(amount)) {
        return;
      }

      const companyName = dividend.instrument_name || dividend.ticker || 'Unknown';

      if (!byYear[year]) {
        byYear[year] = {
          year,
          total: 0,
          months: {},
        };
      }

      if (!byYear[year].months[month]) {
        byYear[year].months[month] = {
          month,
          monthStartUtc,
          total: 0,
          companies: {},
        };
      }

      byYear[year].total += amount;
      byYear[year].months[month].total += amount;
      byYear[year].months[month].companies[companyName] = (byYear[year].months[month].companies[companyName] || 0) + amount;
    });

    const yearlyEntries = Object.values(byYear).sort((a, b) => Number(a.year) - Number(b.year));

    return {
      yearlySeriesData: yearlyEntries.map((entry) => ({
        name: entry.year,
        y: entry.total,
        drilldown: getYearDrilldownId(entry.year),
        custom: {
          label: entry.year,
        },
      })),
      drilldownSeries: yearlyEntries.flatMap((yearEntry) => {
        const monthlyEntries = Object.values(yearEntry.months).sort((a, b) => a.monthStartUtc - b.monthStartUtc);

        const monthlySeries = {
          id: getYearDrilldownId(yearEntry.year),
          type: 'column',
          name: `${yearEntry.year} Monthly Dividends`,
          color: '#66bb6a',
          custom: {
            level: 'month',
          },
          data: monthlyEntries.map((monthEntry) => ({
            name: monthEntry.month,
            x: monthEntry.monthStartUtc,
            y: monthEntry.total,
            drilldown: getMonthDrilldownId(monthEntry.month),
            custom: {
              label: formatMonthLabel(monthEntry.monthStartUtc),
            },
          })),
        };

        const companySeries = monthlyEntries.map((monthEntry) => ({
          id: getMonthDrilldownId(monthEntry.month),
          type: 'column',
          name: `${formatMonthLabel(monthEntry.monthStartUtc)} Breakdown`,
          colorByPoint: true,
          custom: {
            level: 'company',
          },
          data: Object.entries(monthEntry.companies)
            .map(([name, amount]) => ({
              name,
              y: amount,
              custom: {
                fullName: name,
                pct: monthEntry.total > 0 ? (amount / monthEntry.total) * 100 : 0,
              },
            }))
            .sort((a, b) => b.y - a.y),
        }));

        return [monthlySeries, ...companySeries];
      }),
    };
  }, [dividends]);

  const chartOptions = useMemo(() => ({
    chart: {
      type: 'column',
      backgroundColor: 'transparent',
      spacingTop: 8,
      spacingBottom: 28,
    },
    title: { text: null },
    credits: { enabled: false },
    legend: { enabled: false },
    xAxis: buildYearXAxisConfig(),
    yAxis: {
      ...currencyYAxisConfig,
      title: { text: null },
    },
    tooltip: {
      useHTML: true,
      formatter: monthlyDividendTooltipFormatter,
    },
    plotOptions: {
      series: {
        animation: { duration: 400 },
      },
      column: {
        borderRadius: 4,
        pointPadding: 0.08,
      },
    },
    series: [
      {
        type: 'column',
        name: 'Yearly Dividends',
        data: yearlySeriesData,
        color: '#66bb6a',
        dataLabels: { enabled: false },
        custom: {
          level: 'year',
        },
      },
    ],
  }), [yearlySeriesData]);

  const syncXAxisToVisibleLevel = (chart) => {
    if (!chart?.xAxis?.[0]) {
      return;
    }

    const activeSeries = getActiveVisibleSeries(chart);
    const activeLevel = getActiveVisibleSeriesLevel(chart) || 'year';
    const axisStateKey = JSON.stringify({
      activeLevel,
      points: activeSeries?.points?.map((point) => ({
        name: point.name ?? point.category ?? null,
        x: Number.isFinite(point.x) ? point.x : null,
      })) ?? [],
    });

    if (lastAppliedAxisStateRef.current === axisStateKey) {
      return;
    }

    chart.xAxis[0].update(getXAxisConfigForLevel(activeLevel), false);
    chart.redraw(false);
    lastAppliedAxisStateRef.current = axisStateKey;
  };

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    let frameId = 0;

    const syncChartSize = () => {
      frameId = 0;

      const chart = chartRef.current?.chart;
      const wrapper = chartWrapperRef.current;

      if (!chart || !wrapper) {
        return;
      }

      const nextWidth = Math.round(wrapper.clientWidth);
      const nextHeight = Math.round(wrapper.clientHeight);

      if (nextWidth <= 0 || nextHeight <= 0) {
        return;
      }

      if (chart.chartWidth === nextWidth && chart.chartHeight === nextHeight) {
        return;
      }

      chart.setSize(nextWidth, nextHeight, false);
    };

    const requestChartResize = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }

      frameId = requestAnimationFrame(syncChartSize);
    };

    const observer = new ResizeObserver(() => {
      requestChartResize();
    });

    if (chartWrapperRef.current) {
      observer.observe(chartWrapperRef.current);
    }

    requestChartResize();

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }

      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current?.chart;

    if (!chart) {
      return undefined;
    }

    const syncChartXAxis = () => {
      syncXAxisToVisibleLevel(chart);
    };

    syncChartXAxis();

    const removeAfterApplyDrilldown = Highcharts.addEvent(chart, 'afterApplyDrilldown', syncChartXAxis);
    const removeDrillUpAll = Highcharts.addEvent(chart, 'drillupall', syncChartXAxis);

    return () => {
      removeAfterApplyDrilldown?.();
      removeDrillUpAll?.();
      lastAppliedAxisStateRef.current = null;
    };
  }, [dividends]);

  if (!dividends || dividends.length === 0) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Monthly Dividends</Typography>
          <Typography color="text.secondary">No dividend history.</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        <Typography variant="h6" gutterBottom>Monthly Dividends</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Click a year to drill down by month, then a month to drill down by company. Use the breadcrumb to go back.
        </Typography>
        <Box ref={chartWrapperRef} sx={{ flexGrow: 1, minHeight: 440 }}>
          <Chart
            ref={chartRef}
            options={chartOptions}
            containerProps={{ style: { width: '100%', height: '100%' } }}
          >
            <Drilldown
              series={drilldownSeries}
              breadcrumbs={{
                floating: false,
                position: { align: 'left' },
              }}
            />
          </Chart>
        </Box>
      </CardContent>
    </Card>
  );
}
