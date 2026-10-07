import rawCharts from '../charts/index.ts';
import type { Chart } from '../src/engine/chart.ts';
import { validateChart } from '../src/engine/validate.ts';
import { checkScore } from './scores.ts';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  WRITE_LIMITER: RateLimit;
}

const MAX_BODY_BYTES = 8192;
const RETENTION_PER_CHART = 1000;
const LEADERBOARD_SIZE = 50;
const CODE_ATTEMPTS = 3;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const charts: Record<string, Chart> = {};
for (const [id, raw] of Object.entries(rawCharts)) {
  const r = validateChart(raw);
  if (r.ok && r.chart.id === id) charts[id] = r.chart;
  else console.error(`chart ${id} rejected`, r.ok ? ['id mismatch'] : r.errors);
}

class TooLarge extends Error {}

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });

function randomCode(len = 6): string {
  const buf = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(buf, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function getChart(id: unknown): Chart | undefined {
  return typeof id === 'string' && Object.hasOwn(charts, id) ? charts[id] : undefined;
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) throw new TooLarge();
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new TooLarge();
  const body: unknown = JSON.parse(raw);
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error('bad body');
  return body as Record<string, unknown>;
}

async function allowWrite(req: Request, env: Env): Promise<boolean> {
  const key = req.headers.get('cf-connecting-ip') ?? 'unknown';
  const { success } = await env.WRITE_LIMITER.limit({ key });
  return success;
}

const isUniqueViolation = (e: unknown) => e instanceof Error && /UNIQUE constraint failed/i.test(e.message);

async function handle(req: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
    const chartId = url.searchParams.get('chart');
    if (!getChart(chartId)) return json({ error: 'unknown chart' }, { status: 404 });
    const { results } = await env.DB
      .prepare('SELECT player, score FROM scores WHERE chart_id = ? ORDER BY score DESC, id ASC LIMIT ?')
      .bind(chartId, LEADERBOARD_SIZE).all();
    return json(results, { headers: { 'cache-control': 'public, max-age=30' } });
  }

  if (url.pathname === '/api/scores' && req.method === 'POST') {
    if (!(await allowWrite(req, env))) return json({ error: 'too many requests' }, { status: 429 });
    const b = await readJson(req);
    const chart = getChart(b.chart);
    if (!chart) return json({ error: 'invalid' }, { status: 400 });
    const r = checkScore(chart, b);
    if (!r.ok) return json({ error: r.error }, { status: 400 });
    await env.DB
      .prepare('INSERT INTO scores (chart_id, player, score, created_at) VALUES (?, ?, ?, ?)')
      .bind(chart.id, r.player, r.score, Date.now()).run();
    return json({ ok: true }, { status: 201 });
  }

  if (url.pathname === '/api/challenges' && req.method === 'POST') {
    if (!(await allowWrite(req, env))) return json({ error: 'too many requests' }, { status: 429 });
    const b = await readJson(req);
    const chart = getChart(b.chart);
    if (!chart) return json({ error: 'unknown chart' }, { status: 404 });
    for (let attempt = 1; ; attempt++) {
      const code = randomCode();
      try {
        await env.DB
          .prepare('INSERT INTO challenges (code, chart_id, created_at) VALUES (?, ?, ?)')
          .bind(code, chart.id, Date.now()).run();
        return json({ code }, { status: 201 });
      } catch (e) {
        if (!isUniqueViolation(e) || attempt >= CODE_ATTEMPTS) throw e;
      }
    }
  }

  const m = url.pathname.match(/^\/api\/challenges\/([A-Z0-9]{6})$/);
  if (m && req.method === 'GET') {
    const row = await env.DB
      .prepare('SELECT chart_id FROM challenges WHERE code = ?')
      .bind(m[1]).first<{ chart_id: string }>();
    return row && getChart(row.chart_id)
      ? json({ chart: row.chart_id })
      : json({ error: 'not found' }, { status: 404 });
  }

  return json({ error: 'not found' }, { status: 404 });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      return await handle(req, env, url);
    } catch (e) {
      if (e instanceof TooLarge) return json({ error: 'too large' }, { status: 413 });
      if (e instanceof SyntaxError || (e instanceof Error && e.message === 'bad body')) {
        return json({ error: 'bad request' }, { status: 400 });
      }
      console.error(e);
      return json({ error: 'unavailable' }, { status: 503 });
    }
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const stmt = env.DB.prepare(
      `DELETE FROM scores WHERE chart_id = ?1 AND id NOT IN (
         SELECT id FROM scores WHERE chart_id = ?1 ORDER BY score DESC, id ASC LIMIT ?2)`,
    );
    const ids = Object.keys(charts);
    if (ids.length) await env.DB.batch(ids.map(id => stmt.bind(id, RETENTION_PER_CHART)));
  },
} satisfies ExportedHandler<Env>;
