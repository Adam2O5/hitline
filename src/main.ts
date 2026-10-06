import './style.css';
import { unlock } from './audio/context.ts';
import { initSynth } from './audio/synth.ts';
import { loadCalibration } from './engine/calibration.ts';
import { detectClockMethod, type ClockMethod } from './engine/clock.ts';
import { GameController } from './game/controller.ts';
import { TEST_CHART } from './game/testChart.ts';
import { Renderer } from './render/canvas.ts';
import { showCalibration, type CalibrationReason } from './ui/calibration.ts';
import { startDebugOverlay } from './ui/debug.ts';
import { showRound, showRoundResults, showStart } from './ui/screens.ts';

const root = document.querySelector<HTMLDivElement>('#app')!;
const debug = new URLSearchParams(location.search).has('debug');

const app: { ctx: AudioContext | null; method: ClockMethod; offset: number } = {
  ctx: null,
  method: 'current-time',
  offset: 0,
};

showStart(root, async () => {
  const ctx = await unlock();
  app.ctx = ctx;
  initSynth(ctx);
  app.method = await detectClockMethod(ctx);
  if (debug) startDebugOverlay(ctx, () => app);
  const cal = loadCalibration(app.method);
  if (cal.status === 'ok') {
    app.offset = cal.offset;
    playTestRound();
  } else {
    calibrate(cal.status);
  }
});

function calibrate(reason: CalibrationReason): void {
  showCalibration(root, app.ctx!, app.method, reason, offset => {
    if (offset !== null) app.offset = offset;
    playTestRound();
  });
}

function playTestRound(): void {
  const { area, canvas } = showRound(root);
  const renderer = new Renderer(canvas);
  const controller = new GameController(app.ctx!, TEST_CHART, app.method, app.offset, area, renderer, s => {
    controller.detach();
    renderer.dispose();
    showRoundResults(root, s, { onRetry: playTestRound, onCalibrate: () => calibrate('manual') });
  });
  controller.attach();
  controller.startRound(0);
}
