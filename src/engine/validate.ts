import { z } from 'zod';
import { CONFIG } from './config.ts';
import { sec, type Chart, type Note } from './chart.ts';
import { INSTRUMENT_IDS, PITCHED_INSTRUMENTS } from './types.ts';

const ROUNDS = 5;

const NoteSchema = z.strictObject({
  b: z.number().min(0),
  i: z.enum(INSTRUMENT_IDS),
  p: z.int().min(0).max(127).optional(),
});

const ChartSchema: z.ZodType<Chart> = z.strictObject({
  version: z.literal(1),
  id: z.string().regex(/^[a-z0-9-]{3,32}$/),
  title: z.string().min(1).max(60),
  bpm: z.number().min(40).max(240),
  lengthBeats: z.number().positive(),
  loops: z.int().min(1).max(16),
  leadInBeats: z.number().min(0),
  ambient: z.array(NoteSchema).optional(),
  rounds: z.array(z.strictObject({ play: z.array(NoteSchema).min(1) })).length(ROUNDS),
});

export type ValidationResult = { ok: true; chart: Chart } | { ok: false; errors: string[] };

export function validateChart(json: unknown): ValidationResult {
  const parsed = ChartSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`) };
  }
  const chart = parsed.data;
  const errors = validateNotes(chart);
  if (!errors.length) errors.push(...validateSpacing(chart));
  return errors.length ? { ok: false, errors } : { ok: true, chart };
}

function validateNotes(chart: Chart): string[] {
  const errors: string[] = [];
  const check = (notes: Note[], path: string) => {
    notes.forEach((n, k) => {
      if (n.b >= chart.lengthBeats) errors.push(`${path}.${k}: b >= lengthBeats`);
      if (k > 0 && n.b < notes[k - 1].b) errors.push(`${path}.${k}: nuty nieposortowane po b`);
      if (n.p !== undefined && !PITCHED_INSTRUMENTS.includes(n.i)) {
        errors.push(`${path}.${k}: pole p niedozwolone dla instrumentu ${n.i}`);
      }
    });
  };
  if (chart.ambient) check(chart.ambient, 'ambient');
  chart.rounds.forEach((r, k) => check(r.play, `rounds.${k}.play`));
  return errors;
}

export function validateSpacing(chart: Chart): string[] {
  const minGap = CONFIG.windowsMs.ok / 1000;
  const errors: string[] = [];
  chart.rounds.forEach((r, k) => {
    const play = r.play;
    for (let j = 1; j < play.length; j++) {
      const gap = sec(chart, play[j].b - play[j - 1].b);
      if (gap < minGap) errors.push(`rounds.${k}.play.${j}: odstęp ${ms(gap)} < ${ms(minGap)}`);
    }
    if (chart.loops > 1) {
      const gap = sec(chart, chart.lengthBeats - play[play.length - 1].b + play[0].b);
      if (gap < minGap) errors.push(`rounds.${k}.play: odstęp na granicy pętli ${ms(gap)} < ${ms(minGap)}`);
    }
  });
  return errors;
}

const ms = (s: number) => `${Math.round(s * 1000)} ms`;
