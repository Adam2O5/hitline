# 13. Diagram klas

Dokument uzupełnia `02-architecture.md` i `12-implementation-plan.md`. Większość logiki w dokumentacji to funkcje w modułach, nie klasy. Dlatego moduły oznaczono stereotypem `<<module>>`, a typy danych `<<interface>>`, `<<enumeration>>` lub `<<union>>`. Klasami w sensie OOP są `Scheduler` (zdefiniowany w `03`), `Session` i `GameController`. Sygnatury `Session`, `GameController`, `Renderer`, `ApiClient` i `Screens` są propozycją planu (etapy 1-3), nie zapisem z pozostałych dokumentów.

## 1. Model danych

Typy z `engine/types.ts`, `engine/chart.ts` i `engine/session.ts`.

```mermaid
classDiagram
  direction LR

  class InstrumentId {
    <<enumeration>>
    kick808
    snare
    clap
    hat
    openhat
    bass808
    string
    perc
  }

  class Grade {
    <<enumeration>>
    perfect
    good
    ok
    miss
  }

  class ClockMethod {
    <<enumeration>>
    output-timestamp
    current-time
  }

  class Note {
    <<interface>>
    +number b
    +InstrumentId i
    +number p
  }

  class Round {
    <<interface>>
    +Note[] play
  }

  class Chart {
    <<interface>>
    +number version
    +string id
    +string title
    +number bpm
    +number lengthBeats
    +number loops
    +number leadInBeats
    +Note[] ambient
    +Round[] rounds
  }

  class BackingNote {
    <<interface>>
    +number time
    +InstrumentId instrument
    +number pitch
  }

  class PlayableNote {
    <<interface>>
    +boolean hit
    +Grade grade
    +number deltaMs
  }

  class TapResult {
    <<union>>
    hit: note, deltaMs, grade
    empty: instrument, pitch
  }

  class SessionState {
    <<interface>>
    +string chartId
    +number roundIndex
    +string phase
    +number songStart
    +number frozenAt
    +PlayableNote[] notes
    +PlayableNote[][] results
    +number[] emptyTaps
    +number[] perRound
    +number score
    +ClockMethod clockMethod
    +number calibrationOffset
  }

  class ScorePayload {
    <<interface>>
    +string chart
    +string player
    +number score
    +hits
    +number[] emptyTaps
  }

  class Calibration {
    <<interface>>
    +number offset
    +ClockMethod method
  }

  Chart "1" *-- "5" Round : rounds
  Chart "1" o-- "0..*" Note : ambient
  Round "1" o-- "1..*" Note : play
  Note --> InstrumentId
  BackingNote --> InstrumentId
  BackingNote <|-- PlayableNote
  PlayableNote --> Grade
  TapResult ..> PlayableNote : hit
  TapResult ..> Grade
  TapResult ..> InstrumentId : empty
  SessionState "1" *-- "0..*" PlayableNote : notes, results
  SessionState --> ClockMethod
  ScorePayload ..> SessionState : budowany z results
  Calibration --> ClockMethod
```

Uwagi:

- `Note.p` i `BackingNote.pitch` są opcjonalne (numer nuty MIDI, ADR-015).
- `SessionState.frozenAt` jest `number | null`; `PlayableNote.grade` i `PlayableNote.deltaMs` są opcjonalne; `Chart.ambient`, `ScorePayload.hits` i `ScorePayload.emptyTaps` są opcjonalne. Mermaid nie obsługuje tu typów unijnych w składni pól.
- `ScorePayload.hits` ma typ `[index: number, deltaMs: number][]`, z indeksem globalnym nuty (`04`, pkt 6).
- `SessionState.phase` przyjmuje wartości `playing`, `paused`, `countdown`, `round-results`.
- `Calibration` to obiekt zapisywany w `localStorage` pod kluczem `hitline.calibration`.
- `PlayableNote` i `BackingNote` nie przechowują `Note`. Powstają z `Note` przez `expand` (rozwinięcie pętli i konwersja beatów na sekundy), więc zależność jest wytwarzaniem, nie agregacją (diagram 2).

## 2. Moduły i klasy

Zależności zgodne z regułami z `02-architecture.md`, pkt 3: `engine` nie importuje `render`, `ui`, `game` ani `audio` (poza `engine/clock`); `engine/types`, `engine/chart`, `engine/scoring` i `engine/config` nie zależą od API przeglądarki, bo importuje je także Worker; `GameController` jest jedynym miejscem łączącym DOM, audio i `Session`.

```mermaid
classDiagram
  direction TB

  class Config {
    <<module>>
    +windowsMs
    +points
    +emptyTapPenalty number
    +approachTime number
    +countdown number
  }

  class ChartModule {
    <<module>>
    +sec(chart, b) number
    +toPlayable(chart, roundIndex) PlayableNote[]
    +roundOffset(chart, roundIndex) number
    +roundDuration(chart) number
    +toBacking(chart, roundIndex, missed) BackingNote[]
    +maxScore(chart) number
  }

  class ChartValidation {
    <<module>>
    +validateChart(json) ValidationResult
    +validateSpacing(chart) string[]
  }

  class Judge {
    <<module>>
    +judgeTap(tapTime, songStart, notes) TapResult
    -nearestNote(t, notes) PlayableNote
  }

  class Scoring {
    <<module>>
    +gradeFor(absDeltaMs) Grade
    +roundScore(grades, emptyTaps) number
  }

  class Clock {
    <<module>>
    +detectClockMethod(ctx) Promise~ClockMethod~
    +eventToAudioTime(ctx, e, method) number
  }

  class CalibrationModule {
    <<module>>
    +median(xs) number
    +measure(taps, beats, skipBeats) Measurement
    +computeOffset(taps, beats, skipBeats) number
    +loadCalibration(method, storage) LoadResult
    +saveCalibration(offset, method, storage) boolean
  }

  class Session {
    -SessionState state
    -Chart chart
    +Session(chart, clockMethod, calibrationOffset)
    +start(roundIndex, songStart) void
    +onTap(tapTime) TapResult
    +update(now) void
    +pause(pausePos) void
    +beginCountdown(songStart) void
    +isLastRound() boolean
    -closeRound() void
    +getState() SessionState
  }

  class AudioContextProvider {
    <<module>>
    +get() AudioContext
    +unlock() Promise
  }

  class Synth {
    <<module>>
    +initSynth(ctx) void
    +play(instrument, when, pitch) void
    +stopAll() void
  }

  class Scheduler {
    -number idx
    -number timer
    -AudioContext ctx
    -BackingNote[] notes
    -number songStart
    -function play
    +Scheduler(ctx, notes, songStart, play, startIndex)
    +start() void
    +stop() void
    -tick() void
  }

  class GameController {
    -Session session
    -Scheduler scheduler
    +GameController(ctx, chart, method, offset, area, renderer, events)
    +attach() void
    +detach() void
    +startRound(roundIndex) void
    -onPointerDown(e) void
    -onKeyDown(e) void
    -tap(e) void
    -onVisibilityChange() void
    +pause() void
    +resume() Promise
    +exit() Promise
    -frame() void
  }

  class Renderer {
    -CanvasRenderingContext2D g
    +Renderer(canvas)
    +draw(state, songTime) void
    +feedback(tapResult, at) void
    +dispose() void
    -resize() void
  }

  class Screens {
    <<module>>
    +showStart() void
    +showMenu() void
    +showCalibration() void
    +showMapCard(chartId) void
    +showRound() void
    +showPause() void
    +showRoundResults() void
    +showMapResults() void
    +showRanking() void
    +showAbout() void
    +showDebug() void
  }

  class ApiClient {
    <<module>>
    +getLeaderboard(chartId) Promise
    +postScore(payload) Promise
    +createChallenge(chartId) Promise
    +getChallenge(code) Promise
    +savePending(payload) void
    +retryPending() Promise
  }

  class Worker {
    <<module>>
    +fetch(req, env) Response
    +scheduled(event, env) void
  }

  class Blocklist {
    <<module>>
    +isBlockedName(name) boolean
  }

  class D1 {
    <<external>>
    scores
    challenges
  }

  Judge ..> Config
  Judge ..> Scoring : gradeFor
  Scoring ..> Config
  ChartModule ..> Config
  ChartValidation ..> ChartModule
  ChartValidation ..> Config
  CalibrationModule ..> Clock : ClockMethod
  Clock ..> AudioContextProvider
  Synth ..> AudioContextProvider

  Session ..> Judge
  Session ..> Scoring
  Session ..> ChartModule

  GameController "1" *-- "1" Session
  GameController "1" o-- "0..1" Scheduler
  GameController ..> Clock
  GameController ..> CalibrationModule
  GameController ..> Synth
  GameController ..> AudioContextProvider
  GameController ..> ChartModule : toBacking
  GameController ..> Renderer : draw(state, now)
  Scheduler ..> Synth : play (wstrzyknięte)

  Renderer ..> Session : tylko odczyt stanu
  Screens ..> GameController
  Screens ..> CalibrationModule
  Screens ..> ApiClient
  ApiClient ..> Worker : HTTP /api/*

  Worker ..> ChartModule : maxScore, validate
  Worker ..> Scoring : poziom 2
  Worker ..> Blocklist
  Worker --> D1
```

## 3. Mapowanie na pliki

| Element | Plik | Źródło w dokumentacji |
|---|---|---|
| `InstrumentId`, `Grade`, `BackingNote`, `PlayableNote`, `ScorePayload` | `src/engine/types.ts` | `02`, pkt 5; `04`, pkt 6 |
| `Note`, `Round`, `Chart`, `ChartModule` | `src/engine/chart.ts` | `04`, pkt 2, 5-6 |
| `Config` | `src/engine/config.ts` | `12`, etap 1 |
| `Judge`, `TapResult` | `src/engine/judge.ts` | `03`, pkt 4 |
| `Scoring` | `src/engine/scoring.ts` | `01`, pkt 4; `03`, pkt 4 |
| `Clock`, `ClockMethod` | `src/engine/clock.ts` | `03`, pkt 3 |
| `CalibrationModule`, `Calibration` | `src/engine/calibration.ts` | `03`, pkt 5 |
| `Session`, `SessionState` | `src/engine/session.ts` | `02`, pkt 4-5 |
| `GameController` | `src/game/controller.ts` | `02`, pkt 3-4; `03`, pkt 7-8 |
| `AudioContextProvider` | `src/audio/context.ts` | `03`, pkt 2 |
| `Synth` | `src/audio/synth.ts` | `05`, pkt 2 |
| `Scheduler` | `src/audio/scheduler.ts` | `03`, pkt 6 |
| `Renderer` | `src/render/canvas.ts` | `03`, pkt 8 |
| `ApiClient` | `src/net/api.ts` | `06`, pkt 2 i 9 |
| `Screens` | `src/ui/*` | `11-ux.md` |
| `Worker`, `Blocklist` | `worker/index.ts`, `worker/blocklist.ts` | `06`, pkt 4-5 |

## 4. Założenia projektowe widoczne na diagramie

1. `Session` jest czystą logiką: czas dostaje jako liczbę (`onTap(tapTime)`, `update(now)`), nie zna DOM ani audio, więc testuje się w Node bez atrap Web Audio. `onTap` zwraca `null` poza fazą `playing`, więc sesja sama pilnuje ignorowania kliknięć niezależnie od kontrolera.
2. `CalibrationModule` dostaje `Storage` jako argument (domyślnie `localStorage`); `loadCalibration` rozróżnia brak kalibracji (`missing`) i zmianę metody zegara (`method-changed`), bo `11-ux.md` ma dla nich różne komunikaty.
3. `GameController` łączy zdarzenia wejścia, zegar, kalibrację, `Session`, `Synth` i `Scheduler`. W nim jest procedura pauzy i wznowienia (`03`, pkt 7) oraz pętla rAF.
4. `Scheduler` nie zna `Synth` bezpośrednio. Dostaje `AudioContext` i funkcję `play` w konstruktorze, więc można go testować z atrapami.
5. `Judge` mutuje przekazane `PlayableNote` (`hit`, `grade`, `deltaMs`). Stan nut należy do `SessionState`, a `Judge` jest bezstanowy poza tą mutacją.
6. `SessionState.results` przechowuje nuty zakończonych rund; z niego powstają `ScorePayload.hits` i zbiór `missed` dla wariantu B z ADR-006.
7. `Worker` importuje tylko moduły niezależne od przeglądarki (`ChartModule`, `Scoring`, `Config`, `types`).
