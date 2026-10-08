import type { Grade } from '../engine/types.ts';

export const SHAKE_TIME = 0.28; // s

export const FLASH_GAP = 1 / 3; // s, minimalny odstęp między błyskami (WCAG 2.3.1: najwyżej 3 na sekundę)

export type FeedbackKind = Grade | 'empty';

// Amplituda w pikselach układu odniesienia 320x460; renderer mnoży ją przez skalę u.
const AMP: Record<FeedbackKind, number> = { perfect: 5, good: 3.5, ok: 2, miss: 0, empty: 0 };

/** Obwiednia drżenia: maleje kwadratowo do zera po SHAKE_TIME. */
export function shakeEnvelope(age: number, kind: FeedbackKind): number {
  if (age < 0 || age >= SHAKE_TIME) return 0;
  return (1 - age / SHAKE_TIME) ** 2 * AMP[kind];
}

/** Deterministyczne przesunięcie sceny; bez losowości, więc testowalne. */
export function shakeOffset(age: number, kind: FeedbackKind, reduced: boolean): [number, number] {
  const k = reduced ? 0 : shakeEnvelope(age, kind);
  return k === 0 ? [0, 0] : [Math.sin(age * 95) * k, Math.cos(age * 120) * k];
}

/** Rozmiar czcionki mieszczący tekst w maxW; widthAtBase to szerokość zmierzona przy rozmiarze base. */
export function fitFont(widthAtBase: number, base: number, maxW: number): number {
  if (widthAtBase <= 0 || widthAtBase <= maxW) return base;
  return Math.max(1, Math.floor((base * maxW) / widthAtBase));
}

/** Generator pseudolosowy (mulberry32): stałe ziarno daje to samo ziarno obrazu po każdym resize. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Czy wolno wywołać kolejny błysk taśmy; nuty co 150 ms dałyby inaczej ok. 6,7 błysku na sekundę. */
export function canFlash(prevAt: number, at: number): boolean {
  return at - prevAt >= FLASH_GAP - 1e-9; // tolerancja na błąd zaokrąglenia 1/3
}