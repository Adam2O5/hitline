const key = (chartId: string) => `hitline.best.${chartId}`;

export function loadBest(chartId: string, storage: Pick<Storage, 'getItem'> = localStorage): number | null {
  try {
    const v = Number(storage.getItem(key(chartId)));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveBest(
  chartId: string,
  score: number,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): boolean {
  const prev = loadBest(chartId, storage);
  if (score <= 0 || (prev !== null && prev >= score)) return false;
  try {
    storage.setItem(key(chartId), String(score));
  } catch {
    // brak zapisu nie blokuje gry
  }
  return true;
}
