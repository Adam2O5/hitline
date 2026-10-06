# 03. Czas, opóźnienia i synchronizacja

Najważniejszy dokument projektu. Opisuje, skąd bierze się opóźnienie i jak je ograniczać lub kompensować.

## 1. Źródła opóźnienia

| Etap | Opis | Czy da się kontrolować |
|---|---|---|
| Wejście | czas od fizycznego kliknięcia do zdarzenia w przeglądarce | częściowo (`pointerdown` zamiast `click`) |
| Przetwarzanie | obsługa zdarzenia, ocena trafienia | tak |
| Planowanie audio | zlecenie `start()` w `AudioContext` | tak |
| Wyjście audio | bufory systemu, sterownik, urządzenie (Bluetooth wyraźnie zwiększa opóźnienie) | tylko kompensacja |
| Wyświetlanie | opóźnienie monitora, kompozytora przeglądarki | tylko kompensacja |

Wartości zależą od urządzenia, więc projekt nie zakłada konkretnych liczb. Zamiast tego mierzy offset gracza (kalibracja, pkt 5) i dokumentuje pomiary referencyjne (`08-testing.md`).

## 2. Zasady implementacyjne

1. Jeden `AudioContext` na aplikację, utworzony z `latencyHint: 'interactive'`.
2. Odblokowanie kontekstu w pierwszym geście użytkownika (`await ctx.resume()`).
3. Wejście przez `pointerdown` (i `keydown` dla klawiatury), nie `click`.
4. Pozycja kółek obliczana z zegara audio, nie z licznika klatek.
5. Dźwięki trafień są syntezowane lub wstępnie zdekodowane; nic nie jest ładowane ani dekodowane w ścieżce trafienia.
6. Brak alokacji w ścieżce krytycznej (nie tworzymy dużych obiektów w handlerze).
7. Kod w pętli `requestAnimationFrame` jest płytki: obliczenia pozycji i rysowanie.

## 3. Konwersja czasu zdarzenia na czas audio

Zdarzenia wejścia mają znacznik `event.timeStamp` w skali `performance.now()`. Gra wymaga czasu w skali audio.

Dostępne są dwie metody. Dają wyniki przesunięte względem siebie mniej więcej o opóźnienie wyjścia audio (`getOutputTimestamp` odnosi się do dźwięku słyszanego teraz, `currentTime` do dźwięku planowanego), więc w jednej sesji używana jest zawsze ta sama metoda, wybrana raz po odblokowaniu `AudioContext`.

```ts
// engine/clock.ts
export type ClockMethod = 'output-timestamp' | 'current-time';

export function detectClockMethod(ctx: AudioContext): ClockMethod {
  if (typeof ctx.getOutputTimestamp === 'function') {
    const { contextTime, performanceTime } = ctx.getOutputTimestamp();
    if (contextTime !== undefined && performanceTime !== undefined && performanceTime > 0) {
      return 'output-timestamp';
    }
  }
  return 'current-time';
}

export function eventToAudioTime(
  ctx: AudioContext,
  e: PointerEvent | KeyboardEvent,
  method: ClockMethod,
): number {
  if (method === 'output-timestamp') {
    const { contextTime, performanceTime } = ctx.getOutputTimestamp();
    return contextTime! + (e.timeStamp - performanceTime!) / 1000;
  }
  const ageSec = (performance.now() - e.timeStamp) / 1000;
  return ctx.currentTime - ageSec;
}
```

`detectClockMethod` wywołuj dopiero, gdy kontekst jest w stanie `running`; wcześniej `performanceTime` bywa równe 0. Uzasadnienie wyboru: ADR-010.

Uwaga: wsparcie i dokładność `getOutputTimestamp` różnią się między przeglądarkami. Przed wdrożeniem sprawdź wsparcie w macierzy przeglądarek (`08-testing.md`) i porównaj wyniki z metodą zapasową.

## 4. Ocena trafienia

```ts
// engine/judge.ts
import { CONFIG } from './config';

export type Grade = 'perfect' | 'good' | 'ok' | 'miss';

export function gradeFor(absDeltaSec: number): Grade {
  if (absDeltaSec <= CONFIG.windows.perfect) return 'perfect';
  if (absDeltaSec <= CONFIG.windows.good) return 'good';
  if (absDeltaSec <= CONFIG.windows.ok) return 'ok';
  return 'miss';
}

export type TapResult =
  | { kind: 'hit'; note: PlayableNote; delta: number; grade: Grade }
  | { kind: 'empty'; instrument: InstrumentId };

export function judgeTap(
  tapTime: number,          // czas kliknięcia, skala audio, po korekcie kalibracji
  songStart: number,
  notes: PlayableNote[],    // posortowane rosnąco po time, niepuste
): TapResult {
  const w = CONFIG.windows.ok;
  for (const n of notes) {
    if (n.hit || n.grade === 'miss') continue;
    const delta = tapTime - (songStart + n.time);
    if (delta < -w) break;
    if (delta <= w) {
      const grade = gradeFor(Math.abs(delta));
      n.hit = true;
      n.grade = grade;
      return { kind: 'hit', note: n, delta, grade };
    }
  }
  return { kind: 'empty', instrument: nearestNote(tapTime - songStart, notes).instrument };
}

function nearestNote(t: number, notes: PlayableNote[]): PlayableNote {
  let best = notes[0];
  for (const n of notes) if (Math.abs(n.time - t) < Math.abs(best.time - t)) best = n;
  return best;
}
```

Zasada dopasowania: kliknięcie zalicza **najwcześniejszą** niezaliczoną nutę, której okno `ok` obejmuje moment kliknięcia, a nie nutę najbliższą. Dzięki temu przy gęstych nutach kolejność trafień odpowiada kolejności nut. Minimalny odstęp nut (`04-chart-format.md`, pkt 5) ogranicza sytuacje, w których jedno kliknięcie mieści się w oknach kilku nut. Kompromis opisuje ADR-009.

Optymalizacja: lista nut jest posortowana, więc przegląd można zaczynać od wskaźnika (`cursor`) pierwszej niezaliczonej nuty zamiast od początku. Dla map o setkach nut pełny przegląd jest akceptowalny.

Brak kliknięcia: nuta jest oznaczana jako `miss`, gdy `ctx.currentTime > songStart + n.time + windows.ok`.

### Puste kliknięcie

Kliknięcie, które nie trafia w okno żadnej nuty (`kind: 'empty'`):

1. odtwarza natychmiast instrument nuty najbliższej w czasie (także już zaliczonej), żeby gracz słyszał, że kliknięcie zostało zarejestrowane;
2. zwiększa licznik `emptyTaps` rundy;
3. obniża wynik rundy o `CONFIG.emptyTapPenalty` (domyślnie 10 punktów).

Wynik rundy: `max(0, suma_punktów_trafień - emptyTaps * emptyTapPenalty)`. Kara nie może obniżyć wyniku rundy poniżej zera ani wpłynąć na inne rundy.

## 5. Kalibracja

Cel: wyznaczyć stały offset `calibrationOffset` (sekundy) sumujący opóźnienia wyjścia audio, wyświetlania i wejścia danego zestawu.

Procedura:

1. Odtwarzany jest metronom (np. 100 BPM), 10 uderzeń z sygnałem dźwiękowym i wizualnym.
2. Gracz stuka równo z uderzeniami.
3. Pierwsze 2 stuknięcia są odrzucane (rozgrzewka).
4. Dla pozostałych: `d_i = czas_stuknięcia_i - czas_uderzenia_i`.
5. `calibrationOffset = mediana(d_i)`. Mediana odporna jest na pojedyncze odstające wartości.
6. Wynik jest ograniczany do przedziału +/- 0,3 s i zapisywany w `localStorage` (zawsze w `try/catch`) razem z metodą zegara: `{ "offset": 0.042, "method": "output-timestamp" }` pod kluczem `hitline.calibration`.
7. Jeśli rozrzut (np. odchylenie bezwzględne od mediany) przekracza próg, UI proponuje ponowną kalibrację.

Czasy stuknięć w kalibracji są przeliczane tą samą funkcją `eventToAudioTime` i tą samą metodą co w grze. Jeśli przy starcie gry `detectClockMethod` zwraca inną metodę niż zapisana, zapisany offset jest nieważny: gra używa offsetu 0 i proponuje ponowną kalibrację.

```ts
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function computeOffset(taps: number[], clicks: number[], skip = 2): number {
  const ds = taps.slice(skip).map((t, i) => t - clicks[i + skip]);
  const off = median(ds);
  return Math.max(-0.3, Math.min(0.3, off));
}
```

W ocenie trafienia offset jest odejmowany: `tapTime = rawTapTime - calibrationOffset`.

Ograniczenie: pojedynczy offset łączy opóźnienie audio i wizualne. Jeśli testy pokażą, że rozbieżność jest odczuwalna, wprowadź osobne suwaki audio i wideo.

## 6. Scheduler audio dla warstw tła

Warstwy z poprzednich rund są planowane przez wyprzedzający scheduler, a nie przez timery odpalające dźwięk w momencie zdarzenia.

Wzorzec: stały krótki timer (np. co 25 ms) planuje wszystkie nuty, które wypadają w oknie najbliższych ~100-150 ms zegara audio.

```ts
// audio/scheduler.ts
const LOOKAHEAD = 0.12;     // s
const TICK_MS = 25;

export class Scheduler {
  private idx = 0;
  private timer: number | null = null;

  constructor(
    private ctx: AudioContext,
    private notes: { time: number; instrument: InstrumentId }[], // posortowane
    private songStart: number,
    private play: (inst: InstrumentId, when: number) => void,
  ) {}

  start() {
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  stop() { if (this.timer !== null) clearInterval(this.timer); }

  private tick() {
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    while (this.idx < this.notes.length) {
      const when = this.songStart + this.notes[this.idx].time;
      if (when > horizon) break;
      if (when >= this.ctx.currentTime - 0.01) this.play(this.notes[this.idx].instrument, when);
      this.idx++;
    }
  }
}
```

Lista `notes` pochodzi z `toBacking(chart, roundIndex)` (`04-chart-format.md`, pkt 6) i zawiera warstwy poprzednich rund oraz `ambient`.

Timer (`setInterval`) służy wyłącznie do cyklicznego sprawdzania. Moment odtworzenia zawsze wynika z argumentu `when` w skali audio, więc jitter timera nie zmienia rytmu. Wymaga to, by karta nie była w tle: przeglądarki ograniczają timery w nieaktywnych kartach, więc gra wstrzymuje się po utracie widoczności (pkt 7).

## 7. Pauza i wznowienie

Pauza następuje po zdarzeniu `visibilitychange` (karta ukryta) lub po wybraniu pauzy przez gracza.

1. `scheduler.stop()`, następnie `synth.stopAll()`: zatrzymanie z krótkim zanikiem wszystkich źródeł, także tych zaplanowanych z wyprzedzeniem na moment po pauzie.
2. `await ctx.suspend()`. `currentTime` przestaje rosnąć, więc pozycja w utworze jest zachowana: `pausePos = ctx.currentTime - songStart`.
3. Ekran pauzy. Wznowienie wymaga gestu gracza (przycisk „Wznów”), bo część przeglądarek mobilnych nie pozwala na `resume()` bez gestu.
4. `await ctx.resume()`, potem `songStart += COUNTDOWN` (domyślnie 3 s) i nowy `Scheduler` z przesuniętym `songStart`. Nuty tła z przeszłości są pomijane przez warunek w `tick()`.
5. Przez czas odliczania renderer pokazuje zamrożony stan z `pausePos`, a kliknięcia są ignorowane. Po odliczaniu gra toczy się dalej od tego samego miejsca.

## 8. Renderowanie

```ts
function frame() {
  const now = Math.max(ctx.currentTime - songStart, frozenAt ?? -Infinity); // sekundy od początku
  for (const n of visibleNotes(now)) {
    const progress = 1 - (n.time - now) / APPROACH_TIME; // 0 na górze, 1 na linii
    drawCircle(x, progress * hitLineY, n);
  }
  requestAnimationFrame(frame);
}
```

`APPROACH_TIME` (czas spadania, np. 1,2 s) jest parametrem konfiguracyjnym. Pozycja zależy wyłącznie od zegara audio, więc gubienie klatek nie rozsynchronizuje gry z dźwiękiem. `frozenAt` jest równe `pausePos` w trakcie odliczania po pauzie i `null` w pozostałych przypadkach.

## 9. Znane problemy i obejścia

| Problem | Obejście |
|---|---|
| `AudioContext` w stanie `suspended` | `resume()` w pierwszym geście; ekran startowy "Dotknij, aby zacząć" |
| Bluetooth zwiększa opóźnienie wyjścia | kalibracja; komunikat w UI o zalecanym przewodowym wyjściu |
| Mobilne przeglądarki i opóźnienie dotyku | cały obszar gry przyjmuje dotyk; `touch-action: none`; wyłączenie podwójnego tapnięcia/zoomu |
| Karta w tle | pauza gry przy `visibilitychange` (pkt 7) |
| Różnice przeglądarek w `getOutputTimestamp` | test macierzy, metoda zapasowa, metoda zapisana z offsetem kalibracji |
| Kolejka wielu dźwięków naraz | ograniczenie polifonii (np. maks. 16 jednoczesnych źródeł), krótkie obwiednie |
