import type { InstrumentId } from '../engine/types.ts';

const MAX_VOICES = 16;
const FADE = 0.015;

export const PARAMS = {
  kick808: { startHz: 150, endHz: 45, sweep: 0.12, gain: 0.9, decay: 0.8 },
  snare: { hpHz: 1500, noiseGain: 0.6, noiseDecay: 0.2, toneHz: 220, toneGain: 0.4, toneDecay: 0.1 },
  clap: { bpHz: 1200, gain: 0.8, tail: 0.15 },
  hat: { hpHz: 7000, gain: 0.4, decay: 0.04 },
  openhat: { hpHz: 7000, gain: 0.4, decay: 0.25 },
  bass808: { drive: 2, gain: 0.7, decay: 0.6 },
  string: { lpHz: 1200, gain: 0.25, attack: 0.05, decay: 0.6, detune: 7 },
  perc: { hz: 800, gain: 0.5, decay: 0.08 },
} satisfies Record<InstrumentId, Record<string, number>>;

interface Voice {
  out: GainNode;
  sources: AudioScheduledSourceNode[];
  pending: number;
}

let ctx: AudioContext | null = null;
let master: GainNode;
let noise: AudioBuffer;
let saturation: { drive: number; curve: Float32Array<ArrayBuffer> } | null = null;
const voices: Voice[] = [];

function saturationCurve(drive: number): Float32Array<ArrayBuffer> {
  if (saturation?.drive === drive) return saturation.curve;
  const curve = new Float32Array(256);
  for (let k = 0; k < curve.length; k++) curve[k] = Math.tanh(drive * ((k / (curve.length - 1)) * 2 - 1));
  saturation = { drive, curve };
  return curve;
}

export function initSynth(c: AudioContext): void {
  if (ctx === c) return;
  ctx = c;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 4;
  master = c.createGain();
  master.gain.value = 0.8;
  master.connect(comp).connect(c.destination);

  noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = noise.getChannelData(0);
  for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
}

export function play(inst: InstrumentId, when: number, pitch?: number): void {
  if (!ctx) return;
  INSTRUMENTS[inst](ctx, when, pitch);
}

const midiToHz = (n: number) => 440 * 2 ** ((n - 69) / 12);

export function stopAll(): void {
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const v of voices) fadeOut(v, now);
  voices.length = 0;
}

function fadeOut(v: Voice, at: number): void {
  const g = v.out.gain;
  g.cancelScheduledValues(at);
  g.setValueAtTime(g.value, at);
  g.linearRampToValueAtTime(0, at + FADE);
  for (const s of v.sources) {
    try {
      s.stop(at + FADE);
    } catch {
      // źródło już zatrzymane
    }
  }
}

function voice(c: AudioContext): Voice {
  if (voices.length >= MAX_VOICES) fadeOut(voices.shift()!, c.currentTime);
  const out = c.createGain();
  out.connect(master);
  const v: Voice = { out, sources: [], pending: 0 };
  voices.push(v);
  return v;
}

function add(v: Voice, src: AudioScheduledSourceNode, when: number, dur: number): void {
  v.sources.push(src);
  v.pending++;
  src.onended = () => {
    if (--v.pending > 0) return;
    v.out.disconnect();
    const k = voices.indexOf(v);
    if (k !== -1) voices.splice(k, 1);
  };
  src.start(when);
  src.stop(when + dur);
}

function env(c: AudioContext, when: number, peak: number, decay: number, attack = 0.001): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(peak, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  return g;
}

function noiseSource(c: AudioContext): AudioBufferSourceNode {
  const n = c.createBufferSource();
  n.buffer = noise;
  return n;
}

function filter(c: AudioContext, type: BiquadFilterType, frequency: number): BiquadFilterNode {
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  return f;
}

function osc(c: AudioContext, type: OscillatorType, frequency: number): OscillatorNode {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = frequency;
  return o;
}

function hat(c: AudioContext, when: number, p: { hpHz: number; gain: number; decay: number }): void {
  const v = voice(c);
  const n = noiseSource(c);
  n.connect(filter(c, 'highpass', p.hpHz)).connect(env(c, when, p.gain, p.decay)).connect(v.out);
  add(v, n, when, p.decay + 0.02);
}

const INSTRUMENTS: Record<InstrumentId, (c: AudioContext, when: number, pitch?: number) => void> = {
  kick808(c, when) {
    const p = PARAMS.kick808;
    const v = voice(c);
    const o = osc(c, 'sine', p.startHz);
    o.frequency.setValueAtTime(p.startHz, when);
    o.frequency.exponentialRampToValueAtTime(p.endHz, when + p.sweep);
    o.connect(env(c, when, p.gain, p.decay)).connect(v.out);
    add(v, o, when, p.decay + 0.05);
  },

  snare(c, when) {
    const p = PARAMS.snare;
    const v = voice(c);
    const n = noiseSource(c);
    n.connect(filter(c, 'highpass', p.hpHz)).connect(env(c, when, p.noiseGain, p.noiseDecay)).connect(v.out);
    add(v, n, when, p.noiseDecay + 0.05);
    const t = osc(c, 'triangle', p.toneHz);
    t.connect(env(c, when, p.toneGain, p.toneDecay)).connect(v.out);
    add(v, t, when, p.toneDecay + 0.05);
  },

  clap(c, when) {
    const p = PARAMS.clap;
    const v = voice(c);
    const n = noiseSource(c);
    const g = c.createGain();
    g.gain.setValueAtTime(0, when);
    for (let k = 0; k < 3; k++) {
      const t = when + k * 0.012;
      g.gain.setValueAtTime(p.gain, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
    }
    const last = when + 0.036;
    g.gain.setValueAtTime(p.gain, last);
    g.gain.exponentialRampToValueAtTime(0.0001, last + p.tail);
    n.connect(filter(c, 'bandpass', p.bpHz)).connect(g).connect(v.out);
    add(v, n, when, 0.05 + p.tail);
  },

  hat(c, when) {
    hat(c, when, PARAMS.hat);
  },

  openhat(c, when) {
    hat(c, when, PARAMS.openhat);
  },

  bass808(c, when, pitch = 33) {
    const p = PARAMS.bass808;
    const v = voice(c);
    const o = osc(c, 'sine', midiToHz(pitch));
    const ws = c.createWaveShaper();
    ws.curve = saturationCurve(p.drive);
    o.connect(ws).connect(env(c, when, p.gain, p.decay)).connect(v.out);
    add(v, o, when, p.decay + 0.05);
  },

  string(c, when, pitch = 57) {
    const p = PARAMS.string;
    const v = voice(c);
    const lp = filter(c, 'lowpass', p.lpHz);
    lp.connect(env(c, when, p.gain, p.decay, p.attack)).connect(v.out);
    for (const detune of [-p.detune, 0, p.detune]) {
      const o = osc(c, 'sawtooth', midiToHz(pitch));
      o.detune.value = detune;
      o.connect(lp);
      add(v, o, when, p.attack + p.decay + 0.05);
    }
  },

  perc(c, when) {
    const p = PARAMS.perc;
    const v = voice(c);
    const o = osc(c, 'sine', p.hz);
    o.connect(env(c, when, p.gain, p.decay)).connect(v.out);
    add(v, o, when, p.decay + 0.02);
  },
};
