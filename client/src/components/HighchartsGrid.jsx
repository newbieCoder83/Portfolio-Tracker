import { Grid } from '@highcharts/grid-lite-react';

export default function HighchartsGrid({ options }) {
  const themed = {
    ...options,
    rendering: { ...options?.rendering, theme: 'hcg-theme-default hcg-dark' },
  };
  return <Grid options={themed} />;
}
