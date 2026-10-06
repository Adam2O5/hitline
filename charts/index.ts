import type { Chart } from '../src/engine/chart.ts';
import demo01 from './demo-01.json';

// Walidacja w CI (npm run validate:charts) i w Workerze; klient ufa zbudowanym mapom.
const charts: Record<string, Chart> = {
  'demo-01': demo01 as Chart,
};

export default charts;
