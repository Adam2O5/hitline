import type { Chart } from '../engine/chart.ts';

export const TEST_CHART: Chart = {
  version: 1,
  id: 'test-01',
  title: 'Test 01',
  bpm: 100,
  lengthBeats: 4,
  loops: 4,
  leadInBeats: 4,
  rounds: [
    { play: [{ b: 0, i: 'kick808' }, { b: 1, i: 'snare' }, { b: 2, i: 'kick808' }, { b: 3, i: 'snare' }] },
    { play: [{ b: 0.5, i: 'hat' }, { b: 1.5, i: 'hat' }, { b: 2.5, i: 'hat' }, { b: 3.5, i: 'hat' }] },
    { play: [{ b: 1, i: 'clap' }, { b: 3, i: 'clap' }] },
    { play: [{ b: 0, i: 'bass808' }, { b: 2.5, i: 'bass808' }] },
    { play: [{ b: 0, i: 'string' }] },
  ],
};
