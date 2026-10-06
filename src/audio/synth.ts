import type { InstrumentId } from '../engine/types.ts';

const MAX_VOICES = 16;
const FADE = 0.015;

interface Voice {
  out: GainNode;
  sources: AudioScheduledSourceNode[];
  pending: number;
}

let ctx: AudioContext | null = null;
let master: GainNode;
let noise: AudioBuffer;
let saturation: Float32Array<ArrayBuffer>;
const voices: Voice[] = [];

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

  saturation = new Float32Array(256);
  for (let k = 0; k < saturation.length; k++) {
    saturation[k] = Math.tanh(2 * ((k / (saturation.length - 1)) * 2 - 1));
  }
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

function hat(c: AudioContext, when: number, decay: number): void {
  const v = voice(c);
  const n = noiseSource(c);
  n.connect(filter(c, 'highpass', 7000)).connect(env(c, when, 0.4, decay)).connect(v.out);
  add(v, n, when, decay + 0.02);
}

const INSTRUMENTS: Record<InstrumentId, (c: AudioContext, when: number, pitch?: number) => void> = {
  kick808(c, when) {
    const v = voice(c);
    const o = osc(c, 'sine', 150);
    o.frequency.setValueAtTime(150, when);
    o.frequency.exponentialRampToValueAtTime(45, when + 0.12);
    o.connect(env(c, when, 0.9, 0.8)).connect(v.out);
    add(v, o, when, 0.85);
  },

  snare(c, when) {
    const v = voice(c);
    const n = noiseSource(c);
    n.connect(filter(c, 'highpass', 1500)).connect(env(c, when, 0.6, 0.2)).connect(v.out);
    add(v, n, when, 0.25);
    const t = osc(c, 'triangle', 220);
    t.connect(env(c, when, 0.4, 0.1)).connect(v.out);
    add(v, t, when, 0.15);
  },

  clap(c, when) {
    const v = voice(c);
    const n = noiseSource(c);
    const g = c.createGain();
    g.gain.setValueAtTime(0, when);
    for (let k = 0; k < 3; k++) {
      const t = when + k * 0.012;
      g.gain.setValueAtTime(0.8, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
    }
    const last = when + 0.036;
    g.gain.setValueAtTime(0.8, last);
    g.gain.exponentialRampToValueAtTime(0.0001, last + 0.15);
    n.connect(filter(c, 'bandpass', 1200)).connect(g).connect(v.out);
    add(v, n, when, 0.2);
  },

  hat(c, when) {
    hat(c, when, 0.04);
  },

  openhat(c, when) {
    hat(c, when, 0.25);
  },

  bass808(c, when, pitch = 33) {
    const v = voice(c);
    const o = osc(c, 'sine', midiToHz(pitch));
    const ws = c.createWaveShaper();
    ws.curve = saturation;
    o.connect(ws).connect(env(c, when, 0.7, 0.6)).connect(v.out);
    add(v, o, when, 0.65);
  },

  string(c, when, pitch = 57) {
    const v = voice(c);
    const lp = filter(c, 'lowpass', 1200);
    lp.connect(env(c, when, 0.25, 0.6, 0.05)).connect(v.out);
    for (const detune of [-7, 0, 7]) {
      const o = osc(c, 'sawtooth', midiToHz(pitch));
      o.detune.value = detune;
      o.connect(lp);
      add(v, o, when, 0.7);
    }
  },

  perc(c, when) {
    const v = voice(c);
    const o = osc(c, 'sine', 800);
    o.connect(env(c, when, 0.5, 0.08)).connect(v.out);
    add(v, o, when, 0.1);
  },
};
