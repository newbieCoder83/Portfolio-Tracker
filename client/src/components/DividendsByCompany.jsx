import React, { useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';
import StockChart, { Highcharts as StockHighcharts } from '@highcharts/react/Stock';
import highchartsTheme from '../highchartsTheme';
import { formatCurrency } from '../utils/highchartsUtils';

const ROW_HEIGHT = 28;
const MIN_VIEWPORT_HEIGHT = 280;
const INITIAL_LAYOUT_CHROME_HEIGHT = 72;
const WHEEL_SCROLL_THRESHOLD = 80;
const WHEEL_LINE_HEIGHT_PX = 16;
const CATEGORY_SCROLLBAR_THEME = {
  opposite: true,
  buttonsEnabled: false,
  height: 10,
  margin: 8,
  minWidth: 6,
  barBackgroundColor: '#26c6da',
  barBorderColor: '#26c6da',
  barBorderRadius: 4,
  barBorderWidth: 0,
  rifleColor: 'none',
  trackBackgroundColor: 'rgba(255, 255, 255, 0.08)',
  trackBorderColor: 'rgba(255, 255, 255, 0.08)',
  trackBorderRadius: 4,
  trackBorderWidth: 1,
  zIndex: 3,
};

if (!StockHighcharts.__portfolioTrackerThemeApplied) {
  StockHighcharts.setOptions(highchartsTheme);
  StockHighcharts.__portfolioTrackerThemeApplied = true;
}

function truncateCompanyLabel(value) {
  const label = String(value ?? '');
  return label.length > 20 ? `${label.slice(0, 20)}...` : label;
}

function getVisibleRowCount(plotHeight) {
  const numericHeight = Number(plotHeight);

  if (!Number.isFinite(numericHeight) || numericHeight <= 0) {
    return 1;
  }

  return Math.max(1, Math.floor(numericHeight / ROW_HEIGHT));
}

function normalizeWheelDelta(deltaY, deltaMode, fallbackPageSize) {
  if (!Number.isFinite(deltaY) || deltaY === 0) {
    return 0;
  }

  if (deltaMode === 1) {
    return deltaY * WHEEL_LINE_HEIGHT_PX;
  }

  if (deltaMode === 2) {
    return deltaY * fallbackPageSize;
  }

  return deltaY;
}

function buildCategoryScrollbar(enabled) {
  return {
    enabled,
    ...CATEGORY_SCROLLBAR_THEME,
  };
}

function getVisibleCategoryWindow(axis, maxIndex) {
  const currentMin = Number.isFinite(axis?.min) ? Math.round(axis.min) : 0;
  const currentMax = Number.isFinite(axis?.max) ? Math.round(axis.max) : maxIndex;

  return {
    currentMin,
    currentMax,
    windowSize: Math.max(1, currentMax - currentMin + 1),
  };
}

function isPointerInsideChartScrollZone(chart, event) {
  const normalizedEvent = chart.pointer?.normalize(event);

  if (!normalizedEvent) {
    return false;
  }

  const axisOffset = chart.axisOffset || [0, 0, 0, 0];
  const left = Math.max(0, chart.plotLeft - (axisOffset[3] || 0));
  const right = Math.min(chart.chartWidth, chart.plotLeft + chart.plotWidth + (axisOffset[1] || 0));
  const top = Math.max(0, chart.plotTop);
  const bottom = Math.min(chart.chartHeight, chart.plotTop + chart.plotHeight + (axisOffset[2] || 0));

  return normalizedEvent.chartX >= left &&
    normalizedEvent.chartX <= right &&
    normalizedEvent.chartY >= top &&
    normalizedEvent.chartY <= bottom;
}

function shiftVisibleCategoryWindow(axis, stepCount, totalItems) {
  if (!axis || !Number.isFinite(stepCount) || stepCount === 0 || totalItems <= 0) {
    return 0;
  }

  const maxIndex = totalItems - 1;
  const { currentMin, windowSize } = getVisibleCategoryWindow(axis, maxIndex);

  if (windowSize >= totalItems) {
    return 0;
  }

  const maxMin = Math.max(0, maxIndex - windowSize + 1);
  const nextMin = Math.min(maxMin, Math.max(0, currentMin + stepCount));

  if (nextMin === currentMin) {
    return 0;
  }

  const nextMax = Math.min(maxIndex, nextMin + windowSize - 1);

  axis.setExtremes(nextMin, nextMax, true, false, { trigger: 'mousewheel' });

  return nextMin - currentMin;
}

function dividendsByCompanyTooltipFormatter() {
  return `${this.point.options.custom?.fullName || this.point.name}<br/><b>${formatCurrency(this.y)}</b>`;
}

export default function DividendsByCompany({ dividends }) {
  const chartRef = useRef(null);
  const chartWrapperRef = useRef(null);
  const wheelDeltaRef = useRef({ accumulated: 0, direction: 0 });

  const data = useMemo(() => {
    if (!dividends || dividends.length === 0) {
      return [];
    }

    const byCompany = {};

    dividends.forEach((dividend) => {
      const name = dividend.instrument_name || dividend.ticker || 'Unknown';
      const amount = Number(dividend.amount ?? 0);

      if (!Number.isFinite(amount)) {
        return;
      }

      byCompany[name] = (byCompany[name] || 0) + amount;
    });

    return Object.entries(byCompany)
      .map(([name, total]) => ({
        name: truncateCompanyLabel(name),
        y: Math.round(total * 100) / 100,
        custom: {
          fullName: name,
        },
      }))
      .sort((a, b) => b.y - a.y);
  }, [dividends]);

  const initialVisibleRows = getVisibleRowCount(MIN_VIEWPORT_HEIGHT - INITIAL_LAYOUT_CHROME_HEIGHT);
  const initialMaxIndex = Math.min(data.length - 1, initialVisibleRows - 1);

  const chartOptions = useMemo(() => ({
    chart: {
      type: 'bar',
      backgroundColor: '#111827',
      plotBackgroundColor: '#0a0e17',
      spacingTop: 16,
      spacingBottom: 20,
      spacingLeft: 12,
      spacingRight: 20,
      zooming: {
        mouseWheel: {
          enabled: false,
        },
      },
    },
    title: { text: null },
    credits: { enabled: false },
    legend: { enabled: false },
    xAxis: {
      type: 'category',
      categories: data.map((point) => point.name),
      min: 0,
      max: initialMaxIndex,
      lineWidth: 0,
      tickWidth: 0,
      minPadding: 0,
      maxPadding: 0,
      startOnTick: false,
      endOnTick: false,
      labels: {
        style: { fontSize: '10px' },
      },
      scrollbar: buildCategoryScrollbar(data.length > initialVisibleRows),
    },
    yAxis: {
      min: 0,
      title: { text: null },
      offset: 16,
      labels: {
        style: { fontSize: '11px' },
        y: 8,
        formatter() {
          return formatCurrency(this.value);
        },
      },
    },
    tooltip: {
      useHTML: true,
      formatter: dividendsByCompanyTooltipFormatter,
    },
    plotOptions: {
      series: {
        animation: { duration: 400 },
      },
      bar: {
        borderRadius: 4,
        pointPadding: 0.08,
        groupPadding: 0.1,
      },
    },
    series: [
      {
        type: 'bar',
        name: 'Dividends by Company',
        color: '#26c6da',
        data,
        dataLabels: { enabled: false },
      },
    ],
  }), [data, initialMaxIndex, initialVisibleRows]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    let frameId = 0;

    const syncChartLayout = () => {
      frameId = 0;

      const chart = chartRef.current?.chart;
      const wrapper = chartWrapperRef.current;

      if (!chart || !wrapper || data.length === 0) {
        return;
      }

      const nextWidth = Math.round(wrapper.clientWidth);
      const nextHeight = Math.round(wrapper.clientHeight);

      if (nextWidth <= 0 || nextHeight <= 0) {
        return;
      }

      const needsResize = chart.chartWidth !== nextWidth || chart.chartHeight !== nextHeight;

      if (needsResize) {
        chart.setSize(nextWidth, nextHeight, false);
      }

      const categoryAxis = chart.xAxis?.[0];
      if (!categoryAxis) {
        return;
      }

      const visibleRows = getVisibleRowCount(chart.plotHeight);
      const windowSize = Math.min(data.length, visibleRows);
      const maxIndex = data.length - 1;
      const scrollbarEnabled = data.length > windowSize;
      const { currentMin, currentMax } = getVisibleCategoryWindow(categoryAxis, maxIndex);
      const nextMin = scrollbarEnabled
        ? Math.min(Math.max(currentMin, 0), Math.max(0, maxIndex - windowSize + 1))
        : 0;
      const nextMax = scrollbarEnabled ? Math.min(maxIndex, nextMin + windowSize - 1) : maxIndex;
      const scrollbarWasEnabled = Boolean(categoryAxis.options?.scrollbar?.enabled);
      const needsScrollbarUpdate = scrollbarWasEnabled !== scrollbarEnabled;
      const needsExtremesUpdate = currentMin !== nextMin || currentMax !== nextMax;

      if (needsScrollbarUpdate) {
        categoryAxis.update({
          scrollbar: buildCategoryScrollbar(scrollbarEnabled),
        }, false);
      }

      if (needsExtremesUpdate) {
        categoryAxis.setExtremes(nextMin, nextMax, false, false);
      }

      if (needsScrollbarUpdate || needsExtremesUpdate) {
        chart.redraw(false);
      }
    };

    const requestChartResize = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }

      frameId = requestAnimationFrame(syncChartLayout);
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
  }, [data.length]);

  useEffect(() => {
    const wrapper = chartWrapperRef.current;

    if (!wrapper) {
      return undefined;
    }

    const resetWheelState = () => {
      wheelDeltaRef.current.accumulated = 0;
      wheelDeltaRef.current.direction = 0;
    };

    const handleWheel = (event) => {
      const chart = chartRef.current?.chart;
      const categoryAxis = chart?.xAxis?.[0];

      if (!chart || !categoryAxis) {
        resetWheelState();
        return;
      }

      if (!Boolean(categoryAxis.options?.scrollbar?.enabled) || !isPointerInsideChartScrollZone(chart, event)) {
        resetWheelState();
        return;
      }

      const normalizedDelta = normalizeWheelDelta(
        event.deltaY,
        event.deltaMode,
        wrapper.clientHeight || MIN_VIEWPORT_HEIGHT,
      );

      if (!Number.isFinite(normalizedDelta) || normalizedDelta === 0) {
        return;
      }

      const direction = normalizedDelta > 0 ? 1 : -1;
      const maxIndex = data.length - 1;
      const { currentMin, currentMax, windowSize } = getVisibleCategoryWindow(categoryAxis, maxIndex);
      const atTop = currentMin <= 0;
      const atBottom = currentMax >= maxIndex;

      if (windowSize >= data.length || (direction < 0 && atTop) || (direction > 0 && atBottom)) {
        resetWheelState();
        return;
      }

      if (wheelDeltaRef.current.direction !== direction) {
        wheelDeltaRef.current.accumulated = 0;
      }

      wheelDeltaRef.current.direction = direction;
      wheelDeltaRef.current.accumulated += normalizedDelta;

      const requestedSteps = Math.trunc(Math.abs(wheelDeltaRef.current.accumulated) / WHEEL_SCROLL_THRESHOLD);

      if (requestedSteps === 0) {
        return;
      }

      const actualShift = shiftVisibleCategoryWindow(categoryAxis, direction * requestedSteps, data.length);

      if (actualShift === 0) {
        resetWheelState();
        return;
      }

      event.preventDefault();

      if (Math.abs(actualShift) < requestedSteps) {
        resetWheelState();
        return;
      }

      wheelDeltaRef.current.accumulated -= actualShift * WHEEL_SCROLL_THRESHOLD;
    };

    wrapper.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      wrapper.removeEventListener('wheel', handleWheel);
    };
  }, [data.length]);

  if (data.length === 0) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Dividends by Company</Typography>
          <Typography color="text.secondary">No dividend data.</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        <Typography variant="h6" gutterBottom>Dividends by Company</Typography>
        <Box ref={chartWrapperRef} sx={{ width: '100%', flexGrow: 1, minHeight: MIN_VIEWPORT_HEIGHT }}>
          <StockChart
            chartConstructor="chart"
            ref={chartRef}
            options={chartOptions}
            containerProps={{ style: { width: '100%', height: '100%' } }}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
