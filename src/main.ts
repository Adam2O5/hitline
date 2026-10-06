import './style.css';
import charts from '../charts/index.ts';
import { unlock } from './audio/context.ts';
import { initSynth } from './audio/synth.ts';
import { loadCalibration } from './engine/calibration.ts';
import type { Chart } from './engine/chart.ts';
import { detectClockMethod, type ClockMethod } from './engine/clock.ts';
import { GameController } from './game/controller.ts';
import { loadBest, saveBest } from './game/progress.ts';
import { Renderer } from './render/canvas.ts';
import { showCalibration, type CalibrationReason } from './ui/calibration.ts';
import { startDebugOverlay } from './ui/debug.ts';
import {
  showMapCard, showMapResults, showMenu, showPause, showRound, showRoundResults, showStart,
} from './ui/screens.ts';

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
    menu();
  } else {
    calibrate(cal.status);
  }
});

function calibrate(reason: CalibrationReason): void {
  showCalibration(root, app.ctx!, app.method, reason, offset => {
    if (offset !== null) app.offset = offset;
    menu();
  });
}

function menu(): void {
  showMenu(root, Object.values(charts), id => loadBest(id), {
    onPick: mapCard,
    onCalibrate: () => calibrate('manual'),
  });
}

function mapCard(chart: Chart): void {
  showMapCard(root, chart, loadBest(chart.id), { onPlay: () => play(chart), onBack: menu });
}

function play(chart: Chart): void {
  const { area, canvas, pauseButton } = showRound(root);
  const renderer = new Renderer(canvas);
  const controller = new GameController(app.ctx!, chart, app.method, app.offset, area, renderer, {
    onPause: () =>
      showPause(area, {
        onResume: () => void controller.resume(),
        onExit: async () => {
          await controller.exit();
          renderer.dispose();
          menu();
        },
      }),
    onRoundEnd: (s, isLast) => {
      if (!isLast) {
        showRoundResults(area, chart, s, () => controller.startRound(s.roundIndex + 1));
        return;
      }
      controller.detach();
      renderer.dispose();
      const newBest = saveBest(chart.id, s.score);
      showMapResults(root, chart, s, newBest, { onRetry: () => mapCard(chart), onMenu: menu });
    },
  });
  pauseButton.addEventListener('click', () => {
    pauseButton.blur();
    controller.pause();
  });
  controller.attach();
  controller.startRound(0);
}
