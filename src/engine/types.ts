export const INSTRUMENT_IDS = [
  'kick808', 'snare', 'clap', 'hat', 'openhat', 'bass808', 'string', 'perc',
] as const;

export type InstrumentId = (typeof INSTRUMENT_IDS)[number];

export const PITCHED_INSTRUMENTS: readonly InstrumentId[] = ['bass808', 'string'];

export type Grade = 'perfect' | 'good' | 'ok' | 'miss';

export interface BackingNote {
  time: number;                // sekundy od songStart
  instrument: InstrumentId;
  pitch?: number;              // numer nuty MIDI, tylko instrumenty z PITCHED_INSTRUMENTS
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
