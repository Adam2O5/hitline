import { beforeEach, describe, expect, it, vi } from 'vitest';
import charts from '../charts/index.ts';
import { maxScore, roundOffset } from '../src/engine/chart.ts';
import worker, { type Env } from './index.ts';
import { createD1 } from './testing/d1.ts';

const chart = charts['demo-01'];
const TOTAL = roundOffset(chart, chart.rounds.length);

let db: ReturnType<typeof createD1>;
let allowed: boolean;
let env: Env;

beforeEach(() => {
  db = createD1();
  allowed = true;
  env = {
    DB: db as unknown as D1Database,
    ASSETS: { fetch: async () => new Response('asset') } as unknown as Fetcher,
    WRITE_LIMITER: { limit: async () => ({ success: allowed }) } as RateLimit,
  };
});

const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`https://x${path}`, init), env);
const post = (path: string, body: unknown) =>
  call(path, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

const perfect = () => ({
  chart: 'demo-01',
  player: 'Ania',
  score: maxScore(chart),
  hits: Array.from({ length: TOTAL }, (_, i) => [i, 0]),
  emptyTaps: [0, 0, 0, 0, 0],
});

describe('POST /api/scores', () => {
  it('zapisuje wynik równy maxScore', async () => {
    const r = await post('/api/scores', perfect());
    expect(r.status).toBe(201);
    expect(db.raw.prepare('SELECT player, score FROM scores').all()).toMatchObject([{ player: 'Ania', score: 4400 }]);
  });

  it('przelicza wynik z hits i emptyTaps', async () => {
    const hits = [[0, 12], [1, -60], [2, 150]];
    const ok = await post('/api/scores', { ...perfect(), hits, score: 100 + 60 + 30 - 10, emptyTaps: [1, 0, 0, 0, 0] });
    expect(ok.status).toBe(201);
    const bad = await post('/api/scores', { ...perfect(), hits, score: 190, emptyTaps: [1, 0, 0, 0, 0] });
    expect(bad.status).toBe(400);
  });

  it('kara nie schodzi poniżej zera w rundzie', async () => {
    const r = await post('/api/scores', { ...perfect(), hits: [], score: 0, emptyTaps: [50, 0, 0, 0, 0] });
    expect(r.status).toBe(201);
  });

  it.each([
    ['wynik większy niż maxScore', { score: 4401 }],
    ['powtórzony indeks', { hits: [[0, 0], [0, 0]], score: 200 }],
    ['indeks spoza zakresu', { hits: [[TOTAL, 0]], score: 100 }],
    ['deltaMs poza oknem', { hits: [[0, 151]], score: 0 }],
    ['deltaMs niecałkowite', { hits: [[0, 1.5]], score: 100 }],
    ['brak hits', { hits: undefined }],
    ['zła długość emptyTaps', { emptyTaps: [0, 0, 0, 0] }],
    ['nieznana mapa', { chart: 'nope' }],
    ['mapa constructor', { chart: 'constructor' }],
    ['mapa __proto__', { chart: '__proto__' }],
  ])('odrzuca: %s', async (_name, patch) => {
    expect((await post('/api/scores', { ...perfect(), ...patch })).status).toBe(400);
  });

  it.each([
    ['pusty', ''],
    ['za długi', 'a'.repeat(21)],
    ['zakazany', 'kurwa'],
    ['zakazany z podmianą', 'sh1t'],
    ['niedozwolone znaki', 'a<b>'],
    ['spacja na brzegu', ' Ania'],
  ])('odrzuca nick: %s', async (_name, player) => {
    const r = await post('/api/scores', { ...perfect(), player });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'invalid-name' });
  });

  it.each([['null', 'null'], ['liczba', '5'], ['tablica', '[]'], ['niepoprawny JSON', '{']])(
    'odrzuca ciało: %s',
    async (_name, body) => {
      expect((await post('/api/scores', body)).status).toBe(400);
    },
  );

  it('odrzuca ciało ponad 8 KB liczone w bajtach', async () => {
    const body = JSON.stringify({ ...perfect(), pad: 'ż'.repeat(4100) });
    expect(body.length).toBeLessThan(8192);
    expect((await post('/api/scores', body)).status).toBe(413);
  });

  it('zwraca 429 po przekroczeniu limitu', async () => {
    allowed = false;
    expect((await post('/api/scores', perfect())).status).toBe(429);
  });
});

describe('GET /api/leaderboard', () => {
  it('sortuje malejąco, przy remisie wcześniejszy wyżej, maks. 50', async () => {
    const ins = db.raw.prepare('INSERT INTO scores (chart_id, player, score, created_at) VALUES (?, ?, ?, 0)');
    ins.run('demo-01', 'b', 10);
    ins.run('demo-01', 'a', 20);
    ins.run('demo-01', 'c', 10);
    for (let k = 0; k < 60; k++) ins.run('demo-01', `x${k}`, 1);
    const r = await call('/api/leaderboard?chart=demo-01');
    expect(r.headers.get('cache-control')).toBe('public, max-age=30');
    const rows = (await r.json()) as { player: string }[];
    expect(rows).toHaveLength(50);
    expect(rows.slice(0, 3).map(x => x.player)).toEqual(['a', 'b', 'c']);
  });

  it('404 dla nieznanej mapy', async () => {
    expect((await call('/api/leaderboard?chart=__proto__')).status).toBe(404);
  });
});

describe('wyzwania', () => {
  it('tworzy kod i odczytuje mapę', async () => {
    const r = await post('/api/challenges', { chart: 'demo-01' });
    expect(r.status).toBe(201);
    const { code } = (await r.json()) as { code: string };
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(await (await call(`/api/challenges/${code}`)).json()).toEqual({ chart: 'demo-01' });
  });

  it('przy kolizji kodu losuje ponownie, po 3 próbach poddaje się', async () => {
    db.raw.prepare("INSERT INTO challenges VALUES ('AAAAAA', 'demo-01', 0)").run();
    let calls = 0;
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(a: T) => {
      (a as unknown as Uint8Array).fill(calls++ === 0 ? 0 : 1);
      return a;
    });
    const r = await post('/api/challenges', { chart: 'demo-01' });
    expect(await r.json()).toEqual({ code: 'BBBBBB' });

    spy.mockImplementation(<T extends ArrayBufferView | null>(a: T) => {
      (a as unknown as Uint8Array).fill(0);
      return a;
    });
    expect((await post('/api/challenges', { chart: 'demo-01' })).status).toBe(503);
    spy.mockRestore();
  });

  it('404 dla nieznanej mapy i nieznanego kodu', async () => {
    expect((await post('/api/challenges', { chart: 'nope' })).status).toBe(404);
    expect((await call('/api/challenges/ABCDEF')).status).toBe(404);
  });
});

describe('pozostałe', () => {
  it('ścieżki spoza /api/ idą do statyków, nieznane /api/ dają 404', async () => {
    expect(await (await call('/index.html')).text()).toBe('asset');
    expect((await call('/api/nope')).status).toBe(404);
  });

  it('błąd bazy daje 503', async () => {
    db.raw.exec('DROP TABLE scores');
    expect((await post('/api/scores', perfect())).status).toBe(503);
  });

  it('retencja zostawia 1000 najlepszych wyników mapy', async () => {
    const ins = db.raw.prepare('INSERT INTO scores (chart_id, player, score, created_at) VALUES (?, ?, ?, 0)');
    for (let k = 0; k < 1005; k++) ins.run('demo-01', `p${k}`, k);
    ins.run('other', 'z', 0);
    await worker.scheduled({} as ScheduledController, env);
    const left = db.raw.prepare("SELECT COUNT(*) n, MIN(score) lo FROM scores WHERE chart_id = 'demo-01'").get();
    expect(left).toMatchObject({ n: 1000, lo: 5 });
    expect(db.raw.prepare("SELECT COUNT(*) n FROM scores WHERE chart_id = 'other'").get()).toMatchObject({ n: 1 });
  });
});
