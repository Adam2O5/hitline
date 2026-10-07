import type { Chart } from '../engine/chart.ts';
import type { InstrumentId } from '../engine/types.ts';

export const INSTRUMENT_NAMES: Record<InstrumentId, string> = {
  kick808: 'kick',
  snare: 'snare',
  clap: 'clap',
  hat: 'hi-hat',
  openhat: 'open hi-hat',
  bass808: 'bas 808',
  string: 'smyczki',
  perc: 'perkusjonalia',
};

export function instrumentsOf(chart: Chart, roundIndex: number): string {
  const ids = [...new Set(chart.rounds[roundIndex].play.map(n => n.i))];
  return ids.map(i => INSTRUMENT_NAMES[i]).join(', ');
}
