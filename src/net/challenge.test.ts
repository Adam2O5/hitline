import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChallenge, getChallenge, parseChallengeCode } from './api.ts';

const respond = (status: number, body?: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }));

afterEach(() => { vi.restoreAllMocks(); });

describe('wyzwania w kliencie', () => {
  it('normalizuje kod z URL do wielkich liter', () => {
    expect(parseChallengeCode(' abc234 ')).toBe('ABC234');
    expect(parseChallengeCode('')).toBeNull();
    expect(parseChallengeCode(null)).toBeNull();
  });

  it('nie odpytuje API dla kodu o złym formacie', async () => {
    const f = respond(200, { chart: 'demo-01' });
    expect(await getChallenge('ABC')).toEqual({ ok: false, reason: 'not-found' });
    expect(f).not.toHaveBeenCalled();
  });

  it('rozróżnia 404 od niedostępności API', async () => {
    respond(200, { chart: 'demo-01' });
    expect(await getChallenge('ABC234')).toEqual({ ok: true, chartId: 'demo-01' });
    respond(404, { error: 'not found' });
    expect(await getChallenge('ABC234')).toEqual({ ok: false, reason: 'not-found' });
    respond(503);
    expect(await getChallenge('ABC234')).toEqual({ ok: false, reason: 'unavailable' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    expect(await getChallenge('ABC234')).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('tworzy wyzwanie i obsługuje 429', async () => {
    respond(201, { code: 'TX3273' });
    expect(await createChallenge('demo-01')).toEqual({ ok: true, code: 'TX3273' });
    respond(429);
    expect(await createChallenge('demo-01')).toEqual({ ok: false, reason: 'rate-limited' });
    respond(201, { code: 'zły' });
    expect(await createChallenge('demo-01')).toEqual({ ok: false, reason: 'unavailable' });
  });
});
