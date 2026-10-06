import { CONFIG } from '../engine/config.ts';
import type { TapResult } from '../engine/judge.ts';
import type { SessionState } from '../engine/session.ts';
import type { Grade, InstrumentId } from '../engine/types.ts';

const FEEDBACK_TIME = 0.4;   // s

const COLORS: Record<InstrumentId, string> = {
  kick808: '#e8505b',
  snare: '#f9d56e',
  clap: '#f3ae4b',
  hat: '#14b1ab',
  openhat: '#5fd3cd',
  bass808: '#a86cf0',
  string: '#6c9cf0',
  perc: '#f0f0f0',
};

const GRADE_COLORS: Record<Grade, string> = {
  perfect: '#7cf07c',
  good: '#c8f07c',
  ok: '#f0d27c',
  miss: '#888888',
};

export class Renderer {
  private g: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private feedbackText = '';
  private feedbackColor = '';
  private feedbackAt = -Infinity;
  private observer: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }

  dispose(): void {
    this.observer.disconnect();
  }

  feedback(r: TapResult, at: number): void {
    if (r.kind === 'hit') {
      this.feedbackText = r.grade;
      this.feedbackColor = GRADE_COLORS[r.grade];
    } else {
      this.feedbackText = `-${CONFIG.emptyTapPenalty}`;
      this.feedbackColor = '#e8505b';
    }
    this.feedbackAt = at;
  }

  draw(s: Readonly<SessionState>, songTime: number): void {
    const { g, w, h } = this;
    const now = s.frozenAt !== null ? Math.max(songTime, s.frozenAt) : songTime;
    const hitY = h * 0.8;
    const x = w / 2;
    const radius = Math.max(14, Math.min(w, h) * 0.045);

    g.clearRect(0, 0, w, h);

    g.strokeStyle = '#555';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();

    g.strokeStyle = '#eee';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x - radius * 2.5, hitY);
    g.lineTo(x + radius * 2.5, hitY);
    g.stroke();

    for (const n of s.notes) {
      if (n.hit) continue;
      const dt = n.time - now;
      if (dt > CONFIG.approachTime) break;
      if (dt < -0.3) continue;
      const progress = 1 - dt / CONFIG.approachTime;
      g.fillStyle = n.grade === 'miss' ? GRADE_COLORS.miss : COLORS[n.instrument];
      g.beginPath();
      g.arc(x, progress * hitY, radius, 0, Math.PI * 2);
      g.fill();
    }

    const age = now - this.feedbackAt;
    if (age >= 0 && age < FEEDBACK_TIME) {
      g.globalAlpha = 1 - age / FEEDBACK_TIME;
      g.fillStyle = this.feedbackColor;
      g.font = `bold ${Math.round(radius * 1.2)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.fillText(this.feedbackText, x, hitY + radius * 3);
      g.globalAlpha = 1;
    }

    if (s.phase === 'countdown' && s.frozenAt !== null) {
      g.fillStyle = '#fff';
      g.font = `bold ${Math.round(Math.min(w, h) * 0.2)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(Math.max(1, Math.ceil(s.frozenAt - songTime))), w / 2, h / 2);
      g.textBaseline = 'alphabetic';
    }

    g.fillStyle = '#ccc';
    g.font = '16px system-ui, sans-serif';
    g.textAlign = 'left';
    g.fillText(`Runda ${s.roundIndex + 1}/${s.perRound.length}`, 16, 28);
    g.textAlign = 'right';
    g.fillText(`${liveScore(s)} pkt`, w - 16, 28);
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

function liveScore(s: Readonly<SessionState>): number {
  let pts = 0;
  for (const n of s.notes) if (n.grade) pts += CONFIG.points[n.grade];
  return Math.max(0, pts - s.emptyTaps[s.roundIndex] * CONFIG.emptyTapPenalty);
}
