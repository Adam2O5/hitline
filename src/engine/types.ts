export type InstrumentId =
  | 'kick808' | 'snare' | 'clap' | 'hat' | 'openhat' | 'bass808' | 'string' | 'perc';

export type Grade = 'perfect' | 'good' | 'ok' | 'miss';

export interface BackingNote {
  time: number;                // sekundy od songStart
  instrument: InstrumentId;
}

export interface PlayableNote extends BackingNote {
  hit: boolean;
  grade?: Grade;
  deltaMs?: number;            // zaokrąglony błąd trafienia, tylko dla trafionych
}

export interface ScorePayload {
  chart: string;
  player: string;
  score: number;
  hits?: [index: number, deltaMs: number][];
  emptyTaps?: number[];
}
