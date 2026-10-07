import { expect, it } from 'vitest';
import charts from '../../charts/index.ts';
import { toPlayable } from '../engine/chart.ts';
import { Session } from '../engine/session.ts';
import { checkScore } from '../../worker/scores.ts';
import { buildScorePayload } from './api.ts';

it('wynik zbudowany z sesji przechodzi walidację poziomu 2 na serwerze', () => {
  const chart = charts['demo-01'];
  const s = new Session(chart, 'current-time', 0);
  const offsets = [0, 0.03, -0.07, 0.12];
  for (let r = 0; r < chart.rounds.length; r++) {
    const start = r * 100;
    s.start(r, start);
    toPlayable(chart, r).forEach((n, j) => {
      if (j % 3 !== 2) s.onTap(start + n.time + offsets[j % offsets.length]);
    });
    s.onTap(start + 0.01);
    s.update(start + 99);
  }
  const state = s.getState();
  const payload = buildScorePayload(chart, state, 'Ania');
  expect(payload.hits!.length).toBeGreaterThan(0);
  expect(payload.emptyTaps).toEqual([1, 1, 1, 1, 1]);
  expect(checkScore(chart, payload as unknown as Record<string, unknown>)).toEqual({
    ok: true,
    player: 'Ania',
    score: state.score,
  });
});
