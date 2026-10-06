import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { validateChart } from '../src/engine/validate.ts';
import charts from '../charts/index.ts';

const dir = join(import.meta.dirname, '..', 'charts');
let failed = false;

for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const id = basename(file, '.json');
  const problems: string[] = [];
  try {
    const r = validateChart(JSON.parse(readFileSync(join(dir, file), 'utf8')));
    if (!r.ok) problems.push(...r.errors);
    else if (r.chart.id !== id) problems.push(`id "${r.chart.id}" niezgodne z nazwą pliku`);
  } catch (e) {
    problems.push(`niepoprawny JSON: ${(e as Error).message}`);
  }
  if (!Object.hasOwn(charts, id)) problems.push('mapa nie jest zarejestrowana w charts/index.ts');

  if (problems.length) {
    failed = true;
    console.error(`✗ ${file}`);
    for (const p of problems) console.error(`  ${p}`);
  } else {
    console.log(`✓ ${file}`);
  }
}

process.exit(failed ? 1 : 0);
