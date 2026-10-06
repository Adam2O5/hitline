import { CONFIG } from '../engine/config.ts';
import { toPlayable, type Chart } from '../engine/chart.ts';
import { eventToAudioTime, type ClockMethod } from '../engine/clock.ts';
import { Session, type SessionState } from '../engine/session.ts';
import * as synth from '../audio/synth.ts';
import type { Renderer } from '../render/canvas.ts';

export class GameController {
  private session: Session;
  private raf = 0;

  constructor(
    private ctx: AudioContext,
    private chart: Chart,
    private method: ClockMethod,
    private offset: number,
    private area: HTMLElement,
    private renderer: Renderer,
    private onRoundEnd: (s: Readonly<SessionState>) => void,
  ) {
    this.session = new Session(chart, method, offset);
  }

  attach(): void {
    this.area.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('keydown', this.onKeyDown);
  }

  detach(): void {
    this.area.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('keydown', this.onKeyDown);
    cancelAnimationFrame(this.raf);
  }

  startRound(roundIndex: number): void {
    const first = toPlayable(this.chart, roundIndex)[0].time;
    const songStart = this.ctx.currentTime + Math.max(0.1, CONFIG.approachTime - first);
    this.session.start(roundIndex, songStart);
    this.raf = requestAnimationFrame(this.frame);
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    this.tap(e);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'Space' || e.repeat) return;
    e.preventDefault();
    this.tap(e);
  };

  private tap(e: PointerEvent | KeyboardEvent): void {
    const s = this.session.getState();
    if (s.phase !== 'playing') return;
    const tapTime = eventToAudioTime(this.ctx, e, this.method) - this.offset;
    const r = this.session.onTap(tapTime);
    if (!r) return;
    synth.play(r.kind === 'hit' ? r.note.instrument : r.instrument, this.ctx.currentTime);
    this.renderer.feedback(r, this.ctx.currentTime - s.songStart);
  }

  private frame = (): void => {
    const now = this.ctx.currentTime;
    this.session.update(now);
    const s = this.session.getState();
    this.renderer.draw(s, now - s.songStart);
    if (s.phase === 'round-results') {
      this.onRoundEnd(s);
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };
}
