import { CONFIG } from '../engine/config.ts';
import { sec, type Chart } from '../engine/chart.ts';
import type { TapResult } from '../engine/judge.ts';
import type { SessionState } from '../engine/session.ts';
import { instrumentsOf } from '../ui/labels.ts';
import { recordDraw } from './stats.ts';
import { canFlash, fitFont, mulberry32, shakeOffset, type FeedbackKind } from './style.ts';

const FEEDBACK_TIME = 0.4;   // s
const FLASH_TIME = 0.3;      // s

interface Tokens {
  ink: string;
  paper: string;
  gold: string;
  blood: string;
  mute: string;
  line: string;
  display: string;
}

function readTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    ink: v('--ink', '#0a0a0a'),
    paper: v('--paper', '#f4f4f0'),
    gold: v('--gold', '#e8b923'),
    blood: v('--blood', '#d4141c'),
    mute: v('--mute', '#9a9a9a'),
    line: v('--line', '#2a2a2a'),
    display: v('--display', 'Anton, Impact, "Arial Narrow Bold", sans-serif'),
  };
}

export class Renderer {
  private g: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private tokens: Tokens;
  private w = 0;
  private h = 0;
  private u = 1;          // skala względem układu odniesienia 320x460
  private col = 0;        // szerokość kolumny treści
  private colX = 0;       // lewa krawędź kolumny
  private hitY = 0;
  private round = -1;
  private feedbackKind: FeedbackKind = 'empty';
  private feedbackAt = -Infinity;
  private flashAt = -Infinity;
  private titleKey = '';
  private titleSize = 0;
  private observer: ResizeObserver;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private canvas: HTMLCanvasElement, private chart: Chart) {
    this.g = canvas.getContext('2d')!;
    this.bg = document.createElement('canvas');
    this.tokens = readTokens();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }

  dispose(): void {
    this.observer.disconnect();
  }

  feedback(r: TapResult, at: number): void {
    this.feedbackKind = r.kind === 'hit' ? r.grade : 'empty';
    this.feedbackAt = at;
    if (canFlash(this.flashAt, at)) this.flashAt = at;   // błysk taśmy najwyżej 3 razy na sekundę
  }

  draw(s: Readonly<SessionState>, songTime: number): void {
    const { g, w, h, u, col, colX, hitY, tokens: t } = this;
    if (!w || !h) return;
    const t0 = performance.now();
    if (s.roundIndex !== this.round) {
      this.round = s.roundIndex;
      this.feedbackAt = -Infinity;
      this.flashAt = -Infinity;
    }
    const now = s.frozenAt !== null ? Math.max(songTime, s.frozenAt) : songTime;
    const live = s.phase === 'playing';
    const age = live ? now - this.feedbackAt : -1;
    const reduced = this.reducedMotion.matches;
    const [dx, dy] = shakeOffset(age, this.feedbackKind, reduced);
    const flashAge = live && !reduced ? now - this.flashAt : -1;
    const x = w / 2;
    const first = s.notes[0]?.time ?? 0;
    const leadIn = live && now < first - 0.3;

    g.clearRect(0, 0, w, h);
    g.save();
    g.translate(dx * u, dy * u);
    g.drawImage(this.bg, 0, 0, w, h);

    this.drawHeader(s, now, leadIn);
    this.drawTape(now, flashAge, reduced);
    this.drawNotes(s, now);

    if (age >= 0 && age < FEEDBACK_TIME) {
      g.globalAlpha = reduced ? 1 : 1 - age / FEEDBACK_TIME;
      const kind = this.feedbackKind;
      const label = kind === 'empty' ? `-${CONFIG.emptyTapPenalty}` : kind.toUpperCase();
      const color = kind === 'empty' ? t.blood : kind === 'perfect' ? t.gold : kind === 'good' ? t.paper : t.mute;
      this.text(label, x, hitY + 60 * u, 26 * u, color, 'center');
      g.globalAlpha = 1;
    } else if (leadIn) {
      this.text('KLIKAJ. NIE PUDŁUJ.', x, hitY + 60 * u, 20 * u, t.paper, 'center');
    }

    if (s.phase === 'countdown' && s.frozenAt !== null) {
      const size = Math.min(w, h) * 0.3;
      const n = String(Math.max(1, Math.ceil(s.frozenAt - songTime)));
      const y = h / 2 + size * 0.35;
      this.text(n, x + 4 * u, y + 4 * u, size, t.blood, 'center');
      this.text(n, x, y, size, t.paper, 'center');
    }
    g.restore();

    this.text(`${liveScore(s)} PKT`, colX + col - 20 * u, h - 18 * u, 20 * u, t.gold, 'right');
    recordDraw(performance.now() - t0);
  }

  private drawHeader(s: Readonly<SessionState>, now: number, leadIn: boolean): void {
    const { g, u, col, colX, chart, tokens: t } = this;
    const loopLen = sec(chart, chart.lengthBeats);
    const loop = Math.min(chart.loops, Math.max(1, Math.floor((now - sec(chart, chart.leadInBeats)) / loopLen) + 1));
    const l1 = `RUNDA ${s.roundIndex + 1}/${s.perRound.length}`;
    const l2 = `PĘTLA ${loop}/${chart.loops}`;
    g.font = `400 ${15 * u}px ${t.display}`;
    const sw = Math.max(g.measureText(l1).width, g.measureText(l2).width) + 18 * u;
    g.save();
    g.translate(colX + 24 * u, 28 * u);
    g.rotate(0.05);
    g.fillStyle = t.paper;
    g.fillRect(0, 0, sw, 40 * u);
    this.text(l1, 9 * u, 17 * u, 15 * u, t.ink);
    this.text(l2, 9 * u, 34 * u, 15 * u, t.ink);
    g.restore();

    if (leadIn) this.text('GRASZ', colX + 26 * u, 94 * u, 16 * u, t.gold);

    const name = instrumentsOf(chart, s.roundIndex).toUpperCase();
    const key = `${s.roundIndex}|${col}|${u}`;
    if (key !== this.titleKey) {
      const base = 78 * u;
      g.font = `400 ${base}px ${t.display}`;
      this.titleSize = fitFont(g.measureText(name).width, base, col - 48 * u);
      this.titleKey = key;
    }
    const size = this.titleSize;
    g.save();
    g.translate(colX + 22 * u, 100 * u + size * 0.88);
    g.rotate(-0.07);
    this.text(name, 4 * u, 4 * u, size, t.blood);
    this.text(name, 0, 0, size, t.paper);
    g.restore();
  }

  private drawTape(now: number, flashAge: number, reduced: boolean): void {
    const { g, w, u, hitY, tokens: t } = this;
    const half = 16 * u;
    const period = 40 * u;
    g.save();
    g.beginPath();
    g.rect(0, hitY - half, w, 2 * half);
    g.clip();
    g.fillStyle = t.gold;
    g.fillRect(0, hitY - half, w, 2 * half);
    g.fillStyle = t.ink;
    const off = reduced ? 0 : (((now * 30 * u) % period) + period) % period;
    for (let x0 = -2 * period + off; x0 < w + period; x0 += period) {
      g.beginPath();
      g.moveTo(x0, hitY + half);
      g.lineTo(x0 + 20 * u, hitY + half);
      g.lineTo(x0 + 36 * u, hitY - half);
      g.lineTo(x0 + 16 * u, hitY - half);
      g.fill();
    }
    if (flashAge >= 0 && flashAge < FLASH_TIME) {
      g.globalAlpha = (1 - flashAge / FLASH_TIME) * 0.7;
      g.fillStyle = t.blood;
      g.fillRect(0, hitY - half, w, 2 * half);
      g.globalAlpha = 1;
    }
    g.restore();
  }

  private drawNotes(s: Readonly<SessionState>, now: number): void {
    const { g, u, w, hitY, tokens: t } = this;
    const x = w / 2;
    const r = Math.max(14, 17 * u);
    for (const n of s.notes) {
      if (n.hit) continue;
      const dt = n.time - now;
      if (dt > CONFIG.approachTime) break;
      if (dt < -0.3) continue;
      const y = (1 - dt / CONFIG.approachTime) * hitY;
      const miss = n.grade === 'miss';
      g.globalAlpha = (miss ? 0.5 : 1) * (dt >= 0 ? 1 : Math.max(0, 1 + dt / 0.3));
      g.fillStyle = miss ? t.mute : t.gold;
      g.strokeStyle = t.ink;
      g.lineWidth = 3 * u;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = u;
      g.beginPath();
      g.arc(x, y, r * 0.65, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = t.ink;
      g.beginPath();
      g.arc(x, y, 4 * u, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  private text(s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left'): void {
    const g = this.g;
    g.font = `400 ${size}px ${this.tokens.display}`;
    g.textAlign = align;
    g.textBaseline = 'alphabetic';
    g.fillStyle = color;
    g.fillText(s, x, y);
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.w = r.width;
    this.h = r.height;
    this.u = Math.max(0.1, Math.min(r.width / 320, r.height / 460));
    this.col = Math.min(r.width, r.height * 0.72);
    this.colX = (r.width - this.col) / 2;
    this.hitY = r.height * 0.8;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.buildBackground(dpr);
    this.titleKey = '';
  }

  /** Tło, winieta, linia środkowa i ziarno rysowane raz na resize, a nie w każdej klatce. */
  private buildBackground(dpr: number): void {
    const { w, h, u, tokens: t, bg } = this;
    bg.width = Math.max(1, Math.round(w * dpr));
    bg.height = Math.max(1, Math.round(h * dpr));
    const b = bg.getContext('2d')!;
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    b.fillStyle = t.ink;
    b.fillRect(0, 0, w, h);
    const vg = b.createRadialGradient(w / 2, h * 0.55, 40 * u, w / 2, h * 0.55, Math.max(w, h) * 0.7);
    vg.addColorStop(0, 'rgba(120,10,10,0.28)');
    vg.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = vg;
    b.fillRect(0, 0, w, h);
    b.fillStyle = t.line;
    b.fillRect(w / 2 - 2 * u, 0, 4 * u, h);
    const rnd = mulberry32(0x5eed);
    b.fillStyle = t.paper;
    const count = Math.floor((w * h) / 600);
    for (let k = 0; k < count; k++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const size = (0.4 + rnd() * 1.2) * Math.max(1, u);
      b.globalAlpha = rnd() * 0.22;
      b.fillRect(x, y, size, size);
    }
    b.globalAlpha = 1;
  }
}

function liveScore(s: Readonly<SessionState>): number {
  let pts = 0;
  for (const n of s.notes) if (n.grade) pts += CONFIG.points[n.grade];
  return Math.max(0, pts - s.emptyTaps[s.roundIndex] * CONFIG.emptyTapPenalty);
}