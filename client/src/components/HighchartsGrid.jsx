import { useMemo } from 'react';
import { Grid } from '@highcharts/grid-lite-react';

export default function HighchartsGrid({ options }) {
  const themed = useMemo(() => ({
    ...options,
    rendering: { ...options?.rendering, theme: 'hcg-theme-default hcg-dark' },
  }), [options]);

  return <Grid options={themed} />;
}
