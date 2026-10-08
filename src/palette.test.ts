import { describe, expect, it } from 'vitest';
import css from './style.css?raw';
const root = css.match(/:root\s*{([^}]*)}/)![1];
const token = (name: string): string => {
  const m = root.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`brak tokenu --${name}`);
  return m[1];
};

function luminance(hex: string): number {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(token(a)), luminance(token(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('kontrast palety (WCAG 2.x)', () => {
  it.each([
    ['paper', 'ink'], ['gold', 'ink'], ['mute', 'ink'], ['ink', 'gold'],
    ['paper', 'ink-2'], ['mute', 'ink-2'], ['gold', 'ink-2'], ['ink', 'paper'],
  ])('tekst %s na %s spełnia AA (4,5:1)', (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('czerwień wystarcza tylko dla dużego tekstu (3:1) i nie dla małego', () => {
    expect(contrast('blood', 'ink')).toBeGreaterThanOrEqual(3);
    expect(contrast('blood', 'ink')).toBeLessThan(4.5);
  });

  it('elementy interfejsu (obrys pola, fokus) spełniają 3:1', () => {
    expect(contrast('mute', 'ink-2')).toBeGreaterThanOrEqual(3);
    expect(contrast('paper', 'ink')).toBeGreaterThanOrEqual(3);
  });
});
