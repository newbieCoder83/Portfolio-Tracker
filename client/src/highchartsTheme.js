const theme = {
  colors: ['#5c6bc0', '#26c6da', '#4caf50', '#f44336', '#ffb74d', '#ab47bc'],
  chart: {
    backgroundColor: '#111827',
    plotBackgroundColor: '#0a0e17',
    plotBorderWidth: 0,
    style: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    },
  },
  title: {
    style: { color: '#e0e0e0' },
  },
  subtitle: {
    style: { color: '#9e9e9e' },
  },
  xAxis: {
    gridLineColor: '#1e2433',
    lineColor: '#1e2433',
    tickColor: '#1e2433',
    labels: {
      style: { color: '#9e9e9e' },
    },
  },
  yAxis: {
    gridLineColor: '#1e2433',
    lineColor: '#1e2433',
    tickColor: '#1e2433',
    labels: {
      style: { color: '#9e9e9e' },
    },
    title: {
      style: { color: '#9e9e9e' },
    },
  },
  tooltip: {
    backgroundColor: '#1e2433',
    borderColor: 'rgba(255,255,255,0.1)',
    style: { color: '#e0e0e0' },
  },
  legend: {
    itemStyle: { color: '#e0e0e0' },
    itemHoverStyle: { color: '#ffffff' },
  },
  plotOptions: {
    series: {
      animation: { duration: 400 },
      dataLabels: { color: '#e0e0e0' },
    },
  },
};

export default theme;
