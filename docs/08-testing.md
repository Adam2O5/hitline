# 08. Testy

## 1. Warstwy testów

| Warstwa | Narzędzie | Zakres |
|---|---|---|
| Jednostkowe | Vitest | ocena trafień, punktacja, kalibracja, parser map, konwersja beatów |
| Walidacja zasobów | skrypt w CI | wszystkie mapy w `charts/` zgodne ze schematem |
| API | Vitest + lokalny `wrangler dev` | walidacja żądań, odpowiedzi, kody błędów |
| Pomiar opóźnień | ręczny, procedura w pkt 3 | opóźnienie wejście -> dźwięk per urządzenie |
| Ręczne / eksploracyjne | macierz urządzeń (pkt 4) | zachowanie w przeglądarkach |

## 2. Testy jednostkowe (przykłady)

Zegar jest wstrzykiwany, więc logika `engine` nie wymaga przeglądarki.

```ts
// engine/judge.test.ts
import { describe, it, expect } from 'vitest';
import { judgeTap } from './judge';
import { gradeFor } from './scoring';

describe('gradeFor', () => {
  it('klasyfikuje progi (ms)', () => {
    expect(gradeFor(0)).toBe('perfect');
    expect(gradeFor(40)).toBe('perfect');
    expect(gradeFor(41)).toBe('good');
    expect(gradeFor(90)).toBe('good');
    expect(gradeFor(91)).toBe('ok');
    expect(gradeFor(150)).toBe('ok');
    expect(gradeFor(151)).toBe('miss');
  });
});

describe('judgeTap', () => {
  const mk = (time: number) => ({ time, instrument: 'snare' as const, hit: false });

  it('trafia nutę, której okno obejmuje kliknięcie', () => {
    const notes = [mk(1.0), mk(2.0)];
    const r = judgeTap(2.02, 0, notes);
    expect(r.kind).toBe('hit');
    if (r.kind !== 'hit') return;
    expect(r.note).toBe(notes[1]);
    expect(r.grade).toBe('perfect');
    expect(notes[1].hit).toBe(true);
  });

  it('przy dwóch nutach w oknie wybiera wcześniejszą, nie bliższą', () => {
    const notes = [mk(1.0), mk(1.15)];
    const r = judgeTap(1.10, 0, notes);
    expect(r.kind === 'hit' && r.note).toBe(notes[0]);
    expect(r.kind === 'hit' && r.grade).toBe('ok');
  });

  it('poza oknem zwraca puste kliknięcie z instrumentem najbliższej nuty', () => {
    const notes = [mk(1.0), { ...mk(2.0), instrument: 'hat' as const }];
    expect(judgeTap(1.8, 0, notes)).toEqual({ kind: 'empty', instrument: 'hat' });
    expect(notes[0].hit).toBe(false);
  });

  it('nie zalicza tej samej nuty dwa razy', () => {
    const notes = [mk(1.0)];
    expect(judgeTap(1.0, 0, notes).kind).toBe('hit');
    expect(judgeTap(1.0, 0, notes).kind).toBe('empty');
  });

  it('nie dopasowuje nuty oznaczonej jako miss', () => {
    const notes = [{ ...mk(1.0), grade: 'miss' as const }];
    expect(judgeTap(1.0, 0, notes).kind).toBe('empty');
  });

  it('ocenia na delcie zaokrąglonej do ms i zapisuje ją w nucie', () => {
    const a = [mk(1.0)];
    const ra = judgeTap(1.0404, 0, a);
    expect(ra.kind === 'hit' && ra.grade).toBe('perfect');
    expect(a[0].deltaMs).toBe(40);
    const b = [mk(1.0)];
    const rb = judgeTap(1.0406, 0, b);
    expect(rb.kind === 'hit' && rb.grade).toBe('good');
  });
});
```

```ts
// engine/scoring.test.ts
import { it, expect } from 'vitest';
import { roundScore } from './scoring';

it('odejmuje karę za puste kliknięcia i nie schodzi poniżej zera', () => {
  expect(roundScore(['perfect', 'good', 'miss'], 0)).toBe(160);
  expect(roundScore(['perfect', 'good', 'miss'], 2)).toBe(140);
  expect(roundScore(['ok'], 5)).toBe(0);
});
```

```ts
// engine/calibration.test.ts
import { describe, it, expect } from 'vitest';
import { median, computeOffset } from './calibration';

describe('kalibracja', () => {
  it('mediana nieparzysta i parzysta', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  const beats = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  it('odrzuca rozgrzewkę i paruje stuknięcia z najbliższym uderzeniem', () => {
    const taps = [0.5, 1.4, 2.1, 3.1, 4.1, 6.1, 7.1, 7.3, 8.1, 9.1]; // brak stuknięcia przy 5, podwójne przy 7
    expect(computeOffset(taps, beats, 2)).toBeCloseTo(0.1, 3);
  });

  it('ucina do +/-0.3 s', () => {
    expect(computeOffset(beats.map(b => b + 0.4), beats, 2)).toBe(0.3);
  });

  it('odrzuca pomiar przy zbyt małej liczbie par', () => {
    expect(computeOffset([2.1, 3.1, 4.1], beats, 2)).toBeNull();
  });
});
```

```ts
// engine/chart.test.ts
import { describe, it, expect } from 'vitest';
import { toPlayable, toBacking, maxScore } from './chart';

it('konwertuje beaty na sekundy i rozwija pętle', () => {
  const chart: any = {
    bpm: 120, leadInBeats: 2, lengthBeats: 4, loops: 2,
    rounds: [{ play: [{ b: 1, i: 'snare' }] }],
  };
  const notes = toPlayable(chart, 0);
  expect(notes).toHaveLength(2);
  expect(notes[0].time).toBeCloseTo((2 + 1) * 0.5, 6);
  expect(notes[1].time).toBeCloseTo((2 + 4 + 1) * 0.5, 6);
});

it('liczy maksymalny wynik z uwzględnieniem pętli', () => {
  const chart: any = { loops: 2, rounds: [{ play: [1, 2, 3] }, { play: [1, 2] }] };
  expect(maxScore(chart)).toBe(1000);
});

it('toBacking pomija chybione nuty po indeksie globalnym, ale nie ambient', () => {
  const chart: any = {
    bpm: 60, leadInBeats: 0, lengthBeats: 2, loops: 2,
    ambient: [{ b: 0, i: 'string' }],
    rounds: [{ play: [{ b: 0, i: 'kick808' }, { b: 1, i: 'snare' }] }, { play: [{ b: 0.5, i: 'hat' }] }],
  };
  expect(toBacking(chart, 1)).toHaveLength(6);                  // 4 nuty rundy 1 + 2 ambient
  const b = toBacking(chart, 1, new Set([1]));                   // snare w pierwszej pętli
  expect(b).toHaveLength(5);
  expect(b.some(n => n.instrument === 'snare' && n.time === 1)).toBe(false);
});
```

Start rundy: test, że przy wprowadzeniu krótszym niż `CONFIG.approachTime` pierwsza nuta wypada nie wcześniej niż `approachTime` po starcie rundy. Pauza: test kontrolera z atrapą `AudioContext`, że po wznowieniu nie zaplanowano żadnej nuty tła z `time < pausePos`.

Walidacja map: osobne przypadki dla każdej reguły z `04-chart-format.md` (pkt 5), w szczególności odstęp nut krótszy niż `CONFIG.windowsMs.ok` w środku pętli i na granicy pętli, `loops` poza zakresem oraz runda bez nut.

Testy API: dla `POST /api/scores` sprawdź przypadki graniczne:

- wynik równy `maxScore`, wynik większy o 1;
- pusty nick, nick za długi, nick z listy zakazanych (także z podmianami znaków, np. `0` zamiast `o`);
- brak pola, ciało niebędące obiektem (`null`, liczba);
- nieznana mapa oraz nazwy w rodzaju `constructor` i `__proto__`;
- zbyt duże ciało, także przy znakach wielobajtowych (mniej niż 8192 znaków, ale ponad 8 KB);
- przekroczenie limitu zapisów (`429`).

W poziomie 2 dodatkowo: niezgodność wyniku z `hits` i `emptyTaps`, powtórzony indeks nuty, indeks spoza zakresu, `deltaMs` poza +/- 150 ms. Dla zadania retencji: po uruchomieniu `scheduled` każda mapa ma najwyżej 1000 wyników, a usuwane są najniższe.

## 3. Procedura pomiaru opóźnienia

Cel: oszacować opóźnienie od fizycznego kliknięcia do dźwięku z głośnika na danym zestawie.

**Metoda nagrania dwóch zdarzeń audio**

1. Uruchom grę w trybie testowym: każde kliknięcie natychmiast odtwarza kliknięciowy dźwięk testowy (krótki, szeroki impuls).
2. Ustaw mikrofon (zewnętrzny rejestrator lub drugi komputer/telefon) tak, aby słyszał zarówno mechaniczny odgłos kliknięcia myszy lub klawisza, jak i dźwięk z głośnika.
3. Wykonaj 20-30 kliknięć w odstępach około 1 s.
4. W edytorze audio (np. Audacity) zmierz odstęp między odgłosem mechanicznym a dźwiękiem z gry dla każdego kliknięcia.
5. Policz medianę i rozrzut (np. min, max, odchylenie).

Ograniczenia metody: odgłos mechaniczny dociera do mikrofonu z własnym opóźnieniem akustycznym (odległość), a moment fizycznego zadziałania przycisku różni się od momentu słyszalnego kliknięcia. Wynik jest szacunkiem, nie wartością absolutną. Dla porównań między konfiguracjami (np. przewodowe a Bluetooth) metoda jest wystarczająca.

**Metoda wizualna (dla opóźnienia ekranu)**: nagrywanie ekranu i przycisku kamerą o wysokiej częstotliwości klatek (np. tryb slow-motion telefonu), liczenie klatek między dociśnięciem a zmianą obrazu.

**Diagnostyka w aplikacji (ekran debug):** wyświetlaj wartości `ctx.baseLatency` oraz, jeśli dostępne, `ctx.outputLatency`, a także wyliczony offset kalibracji. Dostępność tych właściwości różni się między przeglądarkami.

### Tabela wyników

| Data | Urządzenie | Przeglądarka | Wyjście audio | Mediana [ms] | Min [ms] | Max [ms] | Offset kalibracji [ms] | Uwagi |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

## 4. Macierz kompatybilności

| Środowisko | Odblokowanie audio | `pointerdown` | `getOutputTimestamp` | 60 FPS | Kalibracja | Pauza i wznowienie | Uwagi |
|---|---|---|---|---|---|---|---|
| Chrome (desktop) | | | | | | | |
| Firefox (desktop) | | | | | | | |
| Safari (desktop) | | | | | | | |
| Chrome (Android) | | | | | | | |
| Safari (iOS) | | | | | | | |

Wypełniaj każdą komórkę wartością lub krótkim opisem problemu. W kolumnie `getOutputTimestamp` zapisz metodę zwróconą przez `detectClockMethod`. W kolumnie „Pauza i wznowienie” sprawdź przełączenie karty, zablokowanie ekranu (mobile) i brak dźwięków tła w trakcie odliczania.

## 5. Kryteria akceptacji

- Wszystkie testy jednostkowe i walidacja map przechodzą w CI.
- Pomiar opóźnienia wykonany na co najmniej 3 konfiguracjach i zapisany w tabeli.
- Kalibracja redukuje systematyczny błąd gracza (mediana `delta` po kalibracji bliska zera w teście z metronomem).
- Gra pozostaje w pełni grywalna po wyłączeniu API.
