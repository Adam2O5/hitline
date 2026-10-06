# 04. Format mapy nut

Mapa (chart) opisuje utwór: tempo, długość pętli, rundy i położenie nut. Jest plikiem JSON w katalogu `charts/`, walidowanym przy ładowaniu i w buildzie.

## 1. Założenia

- Czas nut wyrażony w **beatach**, nie w sekundach. Dzięki temu zmiana BPM nie wymaga przeliczania nut.
- Konwersja: `sekundy = beat * 60 / bpm`.
- Runda to pętla o długości `lengthBeats` powtórzona `loops` razy. Nuty rundy są zapisane raz, dla jednej pętli.
- Tło rundy N jest składane w trakcie gry z nut `play` rund 1..N-1 (pkt 4) oraz opcjonalnej warstwy `ambient`.
- Wersja formatu w polu `version`.

## 2. Schemat

```ts
// engine/chart.ts
export type InstrumentId =
  | 'kick808' | 'snare' | 'clap' | 'hat' | 'openhat' | 'bass808' | 'string' | 'perc';

export interface Note {
  b: number;                 // pozycja w beatach od początku pętli (>= 0, < lengthBeats)
  i: InstrumentId;           // instrument
}

export interface Round {
  /** Nuty grane przez gracza w jednej pętli tej rundy. */
  play: Note[];
}

export interface Chart {
  version: 1;
  id: string;                // [a-z0-9-]{3,32}
  title: string;
  bpm: number;               // 40..240
  lengthBeats: number;       // długość jednej pętli w beatach
  loops: number;             // liczba powtórzeń pętli w każdej rundzie, 1..16
  leadInBeats: number;       // wprowadzenie przed pierwszą nutą każdej rundy
  ambient?: Note[];          // warstwa tła grana w każdej rundzie, nigdy przez gracza
  rounds: Round[];           // dokładnie 5
}
```

Czas trwania rundy: `(leadInBeats + loops * lengthBeats) * 60 / bpm` sekund.

## 3. Przykład

```json
{
  "version": 1,
  "id": "demo-01",
  "title": "Demo 01",
  "bpm": 90,
  "lengthBeats": 4,
  "loops": 4,
  "leadInBeats": 4,
  "ambient": [{ "b": 0, "i": "string" }],
  "rounds": [
    { "play": [{ "b": 0, "i": "kick808" }, { "b": 2, "i": "kick808" }] },
    { "play": [{ "b": 1, "i": "snare" }, { "b": 3, "i": "snare" }] }
  ]
}
```

Powyższy przykład jest skrócony (2 z 5 rund). Pełna mapa musi zawierać dokładnie 5 rund. Runda trwa tu `(4 + 4 * 4) * 60 / 90` = około 13,3 s.

## 4. Reguły kumulacji

1. W rundzie N gracz gra nuty `play` tej rundy, powtórzone `loops` razy.
2. Tło rundy N tworzą nuty `play` rund 1..N-1 (każda powtórzona `loops` razy) oraz `ambient`. Odtwarza je automatycznie `Scheduler`.
3. Nuta trafiona przez gracza odtwarza dźwięk natychmiast. Nuta chybiona w rundzie N, w tle kolejnych rund:
   - wariant domyślny: jest odtwarzana w poprawnym miejscu (tło jest zawsze kompletne);
   - wariant alternatywny (do przetestowania): w tle nie gra nuta o tym samym indeksie w tej samej pętli, w której gracz chybił. Gracz „słyszy” własne błędy.
4. `ambient` nie podlega ocenie i nie wpływa na wynik.

Decyzja o wariancie jest zapisana w `09-risks-and-decisions.md` (ADR-006, do podjęcia po testach z graczami). Model składania tła opisuje ADR-008.

## 5. Walidacja

Ładowanie mapy musi odrzucić plik, jeśli którykolwiek warunek nie jest spełniony:

- `version === 1`
- `id` pasuje do `^[a-z0-9-]{3,32}$`
- `40 <= bpm <= 240`
- `lengthBeats > 0`, `leadInBeats >= 0`
- `loops` jest liczbą całkowitą, `1 <= loops <= 16`
- `rounds.length === 5`, każda runda ma co najmniej jedną nutę `play`
- każda nuta (w `play` i `ambient`): `0 <= b < lengthBeats`, `i` należy do `InstrumentId`
- nuty w każdej tablicy posortowane rosnąco po `b`
- minimalny odstęp między kolejnymi nutami `play` jednej rundy, **w sekundach**, nie mniejszy niż `CONFIG.windows.ok`. Sprawdzany także na granicy pętli (ostatnia nuta pętli i pierwsza nuta następnej), jeśli `loops > 1`. Uzasadnienie: ADR-009.

Zalecana implementacja: biblioteka walidacji schematu (np. Zod) lub JSON Schema z walidatorem. Reguła minimalnego odstępu wymaga osobnej funkcji, bo zależy od `bpm` i `CONFIG`. Walidacja uruchamiana jest w trzech miejscach: przy ładowaniu w kliencie, w skrypcie `npm run validate:charts` (CI) i w Workerze przy wyliczaniu maksymalnego wyniku.

## 6. Konwersja na nuty grywalne

```ts
const sec = (chart: Chart, b: number) => (b * 60) / chart.bpm;

function expand(chart: Chart, notes: Note[]): { time: number; instrument: InstrumentId }[] {
  const lead = sec(chart, chart.leadInBeats);
  const out: { time: number; instrument: InstrumentId }[] = [];
  for (let loop = 0; loop < chart.loops; loop++) {
    for (const n of notes) {
      out.push({ time: lead + sec(chart, loop * chart.lengthBeats + n.b), instrument: n.i });
    }
  }
  return out;
}

export function toPlayable(chart: Chart, roundIndex: number): PlayableNote[] {
  return expand(chart, chart.rounds[roundIndex].play).map(n => ({ ...n, hit: false }));
}

export function toBacking(chart: Chart, roundIndex: number): { time: number; instrument: InstrumentId }[] {
  const layers = chart.rounds.slice(0, roundIndex).map(r => r.play);
  if (chart.ambient) layers.push(chart.ambient);
  return layers.flatMap(l => expand(chart, l)).sort((a, b) => a.time - b.time);
}

export function maxScore(chart: Chart, pointsPerPerfect = 100): number {
  return chart.rounds.reduce((s, r) => s + r.play.length * chart.loops * pointsPerPerfect, 0);
}
```

`toBacking` realizuje wariant domyślny z pkt 4. Wariant alternatywny wymaga przekazania wyników poprzednich rund i pominięcia chybionych nut.

Indeks nuty w wyniku wysyłanym do serwera (`hits`, patrz `06-backend-and-data.md`) to pozycja w połączonej liście `toPlayable(chart, 0..4)`, czyli rundy po kolei, w każdej pętle po kolei.

## 7. Wersjonowanie

Zmiana niekompatybilna wstecz podnosi `version` i wymaga migracji istniejących map. Loader odrzuca nieznane wersje z czytelnym komunikatem.

## 8. Zasady treści

Mapy w repozytorium muszą być własnymi kompozycjami lub pochodzić ze źródeł o jawnej licencji. Mapa nie może być zapisem rytmu i melodii konkretnego, chronionego utworu. Patrz `05-audio-assets.md` i `09-risks-and-decisions.md`.
