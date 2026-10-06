import { eventToAudioTime, type ClockMethod } from '../engine/clock.ts';
import { measure, saveCalibration } from '../engine/calibration.ts';
import * as synth from '../audio/synth.ts';
import { button, el, screen } from './dom.ts';

const BEATS = 10;
const WARMUP = 2;
const INTERVAL = 0.6;        // s, 100 BPM
const FLASH = 0.08;          // s

export type CalibrationReason = 'missing' | 'method-changed' | 'manual';

const INTRO: Record<CalibrationReason, string> = {
  missing: 'Zanim zagrasz, zmierzmy opóźnienie Twojego urządzenia.',
  'method-changed': 'Zmieniły się warunki odtwarzania. Skalibruj ponownie.',
  manual: 'Kalibracja opóźnienia.',
};

export function showCalibration(
  root: HTMLElement,
  ctx: AudioContext,
  method: ClockMethod,
  reason: CalibrationReason,
  onDone: (offset: number | null) => void,
): void {
  screen(
    root,
    el('h2', '', 'Kalibracja'),
    el('p', '', INTRO[reason]),
    el('p', 'hint', `Usłyszysz ${BEATS} uderzeń. Stukaj (klik, dotyk lub spacja) równo z nimi. Pierwsze ${WARMUP} to rozgrzewka.`),
    el('p', 'hint', 'Słuchawki Bluetooth zwiększają opóźnienie; zalecane jest wyjście przewodowe.'),
    button('Start', () => run(root, ctx, method, reason, onDone)),
    button('Pomiń', () => onDone(null), true),
  );
}

function run(
  root: HTMLElement,
  ctx: AudioContext,
  method: ClockMethod,
  reason: CalibrationReason,
  onDone: (offset: number | null) => void,
): void {
  const pulse = el('div', 'pulse');
  const label = el('p', '', '');
  const s = screen(root, pulse, label);
  s.classList.add('game');

  const t0 = ctx.currentTime + 1;
  const beats = Array.from({ length: BEATS }, (_, k) => t0 + k * INTERVAL);
  for (const b of beats) synth.play('perc', b);

  const taps: number[] = [];
  const onPointer = (e: PointerEvent) => {
    e.preventDefault();
    taps.push(eventToAudioTime(ctx, e, method));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || e.repeat) return;
    e.preventDefault();
    taps.push(eventToAudioTime(ctx, e, method));
  };
  s.addEventListener('pointerdown', onPointer);
  window.addEventListener('keydown', onKey);

  const end = beats[BEATS - 1] + INTERVAL;
  const frame = () => {
    const now = ctx.currentTime;
    if (now >= end) {
      s.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
      result(root, ctx, method, reason, onDone, taps, beats);
      return;
    }
    const k = beats.findIndex(b => now >= b && now < b + FLASH);
    pulse.classList.toggle('on', k !== -1);
    const passed = beats.filter(b => now >= b).length;
    label.textContent = passed === 0 ? 'Przygotuj się…' : passed <= WARMUP ? 'Rozgrzewka' : `${passed - WARMUP}/${BEATS - WARMUP}`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function result(
  root: HTMLElement,
  ctx: AudioContext,
  method: ClockMethod,
  reason: CalibrationReason,
  onDone: (offset: number | null) => void,
  taps: number[],
  beats: number[],
): void {
  const m = measure(taps, beats, WARMUP);
  const retry = button('Powtórz', () => run(root, ctx, method, reason, onDone));
  const cancel = button('Anuluj', () => onDone(null), true);

  if (!m) {
    screen(root, el('h2', '', 'Za mało stuknięć'), el('p', '', 'Spróbuj ponownie.'), retry, cancel);
    return;
  }

  const save = button('Zapisz', () => {
    saveCalibration(m.offset, method);
    onDone(m.offset);
  });
  screen(
    root,
    el('h2', '', `Offset: ${Math.round(m.offset * 1000)} ms`),
    el('p', 'hint', `Rozrzut: ${Math.round(m.spreadMs)} ms`),
    ...(m.reliable ? [] : [el('p', 'warn', 'Pomiar niepewny, spróbuj ponownie.')]),
    save,
    retry,
    cancel,
  );
}
