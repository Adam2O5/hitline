export const CONFIG = {
  windowsMs: { perfect: 40, good: 90, ok: 150 },
  points: { perfect: 100, good: 60, ok: 30, miss: 0 },
  emptyTapPenalty: 10,
  approachTime: 1.2,   // s
  countdown: 3,        // s
  calibrationMaxSpreadMs: 40,
} as const;
