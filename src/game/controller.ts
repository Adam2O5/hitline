import { CONFIG } from '../engine/config.ts';
import { toBacking, toPlayable, type Chart } from '../engine/chart.ts';
import { eventToAudioTime, type ClockMethod } from '../engine/clock.ts';
import { Session, type SessionState } from '../engine/session.ts';
import type { BackingNote } from '../engine/types.ts';
import { Scheduler } from '../audio/scheduler.ts';
import * as synth from '../audio/synth.ts';
import type { Renderer } from '../render/canvas.ts';
import { planResume } from './pause.ts';

export interface ControllerEvents {
  onRoundEnd: (s: Readonly<SessionState>, isLast: boolean) => void;
  onPause: () => void;
}

export class GameController {
  private session: Session;
  private scheduler: Scheduler | null = null;
  private backing: BackingNote[] = [];
  private raf = 0;
  private suspending: Promise<void> | null = null;

  constructor(
    private ctx: AudioContext,
    private chart: Chart,
    private method: ClockMethod,
    private offset: number,
    private area: HTMLElement,
    private renderer: Renderer,
    private events: ControllerEvents,
  ) {
    this.session = new Session(chart, method, offset);
  }

  attach(): void {
    this.area.addEventListener('pointerdown', this.onPointerDown);
    this.area.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  detach(): void {
    this.area.removeEventListener('pointerdown', this.onPointerDown);
    this.area.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    cancelAnimationFrame(this.raf);
    this.scheduler?.stop();
    this.scheduler = null;
  }

  getState(): Readonly<SessionState> {
    return this.session.getState();
  }

  startRound(roundIndex: number): void {
    const first = toPlayable(this.chart, roundIndex)[0].time;
    const songStart = this.ctx.currentTime + Math.max(0.1, CONFIG.approachTime - first);
    this.session.start(roundIndex, songStart);
    this.backing = toBacking(this.chart, roundIndex);
    this.startScheduler(songStart, 0);
    this.loop();
  }

  pause(): void {
    const s = this.session.getState();
    if (s.phase !== 'playing' && s.phase !== 'countdown') return;
    this.session.pause(this.ctx.currentTime - s.songStart);
    this.scheduler?.stop();
    synth.stopAll();
    cancelAnimationFrame(this.raf);
    this.suspending = this.ctx.suspend();
    this.events.onPause();
  }

  async resume(): Promise<void> {
    const s = this.session.getState();
    if (s.phase !== 'paused' || s.frozenAt === null) return;
    const resumed = this.ctx.resume();
    await this.suspending;
    await resumed;
    if (this.ctx.state !== 'running') await this.ctx.resume();
    const plan = planResume(this.backing, s.frozenAt, this.ctx.currentTime, CONFIG.countdown);
    this.session.beginCountdown(plan.songStart);
    this.startScheduler(plan.songStart, plan.startIndex);
    this.loop();
  }

  async exit(): Promise<void> {
    this.detach();
    synth.stopAll();
    const resumed = this.ctx.state === 'running' ? null : this.ctx.resume();
    await this.suspending;
    await resumed;
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  private startScheduler(songStart: number, startIndex: number): void {
    this.scheduler?.stop();
    this.scheduler = new Scheduler(this.ctx, this.backing, songStart, synth.play, startIndex);
    this.scheduler.start();
  }

  private loop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    this.tap(e);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      this.pause();
      return;
    }
    if (e.code !== 'Space' || this.session.getState().phase !== 'playing') return;
    e.preventDefault();
    if (!e.repeat) this.tap(e);
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) this.pause();
  };

  private tap(e: PointerEvent | KeyboardEvent): void {
    const s = this.session.getState();
    if (s.phase !== 'playing') return;
    const tapTime = eventToAudioTime(this.ctx, e, this.method) - this.offset;
    const r = this.session.onTap(tapTime);
    if (!r) return;
    if (r.kind === 'hit') synth.play(r.note.instrument, this.ctx.currentTime, r.note.pitch);
    else synth.play(r.instrument, this.ctx.currentTime, r.pitch);
    this.renderer.feedback(r, this.ctx.currentTime - s.songStart);
  }

  private frame = (): void => {
    const now = this.ctx.currentTime;
    this.session.update(now);
    const s = this.session.getState();
    this.renderer.draw(s, now - s.songStart);
    if (s.phase === 'round-results') {
      this.scheduler?.stop();
      this.scheduler = null;
      this.events.onRoundEnd(s, this.session.isLastRound());
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };
}
