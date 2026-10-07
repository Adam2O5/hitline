import type { Chart } from '../src/engine/chart.ts';
import demo01 from './demo-01.json';
import easy01 from './easy-01.json';
import hard01 from './hard-01.json';
import mid01 from './mid-01.json';

// Walidacja w CI (npm run validate:charts) i w Workerze; klient ufa zbudowanym mapom.
const charts: Record<string, Chart> = {
  'easy-01': easy01 as Chart,
  'demo-01': demo01 as Chart,
  'mid-01': mid01 as Chart,
  'hard-01': hard01 as Chart,
};

export default charts;
