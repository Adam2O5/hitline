import './style.css';
import charts from '../charts/index.ts';
import { unlock } from './audio/context.ts';
import { initSynth } from './audio/synth.ts';
import { loadCalibration } from './engine/calibration.ts';
import type { Chart } from './engine/chart.ts';
import { detectClockMethod, type ClockMethod } from './engine/clock.ts';
import { GameController } from './game/controller.ts';
import { loadBest, saveBest } from './game/progress.ts';
import {
  buildScorePayload, createChallenge, getChallenge, getLeaderboard, loadPlayer, parseChallengeCode, postScore,
  retryPending, savePlayer,
} from './net/api.ts';
import { el, screen } from './ui/dom.ts';
import { Renderer } from './render/canvas.ts';
import { showCalibration, type CalibrationReason } from './ui/calibration.ts';
import { startDebugOverlay } from './ui/debug.ts';
import { startTuningPanel } from './ui/tuning.ts';
import {
  showAbout, showLeaderboard, showMapCard, showMapResults, showMenu, showPause, showRound, showRoundResults, showStart,
} from './ui/screens.ts';

const root = document.querySelector<HTMLDivElement>('#app')!;
const params = new URLSearchParams(location.search);
const debug = params.has('debug');
let challengeCode = parseChallengeCode(params.get('c'));
if (challengeCode) {
  params.delete('c');
  const qs = params.toString();
  history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
}

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
  if (debug) {
    startDebugOverlay(ctx, () => app);
    startTuningPanel(ctx);
  }
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

function menu(notice = ''): void {
  void retryPending();
  if (challengeCode) {
    const code = challengeCode;
    challengeCode = null;
    void openChallenge(code);
    return;
  }
  showMenu(root, Object.values(charts), id => loadBest(id), {
    onPick: mapCard,
    onCalibrate: () => calibrate('manual'),
    onRanking: () => ranking(Object.values(charts)[0], () => menu()),
    onAbout: () => showAbout(root, () => menu()),
  }, notice);
}

async function openChallenge(code: string): Promise<void> {
  screen(root, el('p', 'hint', 'Wczytywanie wyzwania…'));
  const r = await getChallenge(code);
  const chart = r.ok && Object.hasOwn(charts, r.chartId) ? charts[r.chartId] : undefined;
  if (chart) {
    mapCard(chart);
    return;
  }
  menu(!r.ok && r.reason === 'unavailable'
    ? 'Nie udało się wczytać wyzwania. Spróbuj później.'
    : 'Nie znaleziono wyzwania.');
}

function mapCard(chart: Chart): void {
  showMapCard(root, chart, loadBest(chart.id), getLeaderboard(chart.id), {
    onPlay: () => play(chart),
    onBack: () => menu(),
    onChallenge: () => createChallenge(chart.id),
  });
}

function ranking(selected: Chart | undefined, onBack: () => void): void {
  if (!selected) return;
  showLeaderboard(root, Object.values(charts), selected, getLeaderboard, onBack);
}

function play(chart: Chart): void {
  const { area, canvas, pauseButton } = showRound(root);
  const renderer = new Renderer(canvas, chart);
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
      let sent = false;
      const showResults = () =>
        showMapResults(root, chart, s, newBest, loadPlayer(), {
          onSend: async player => {
            if (sent) return 'ok';
            savePlayer(player);
            const r = await postScore(buildScorePayload(chart, s, player));
            sent = r === 'ok';
            return r;
          },
          onRetry: () => mapCard(chart),
          onRanking: () => ranking(chart, showResults),
          onMenu: menu,
        });
      showResults();
    },
  });
  pauseButton.addEventListener('click', () => {
    pauseButton.blur();
    controller.pause();
  });
  controller.attach();
  controller.startRound(0);
}
