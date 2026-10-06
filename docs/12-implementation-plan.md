# 12. Plan implementacji

Plan opiera się na `10-roadmap.md` (etapy 1-5), z dodanym etapem 0 (szkielet). Kolejność w każdym etapie wynika z zależności modułów z `02-architecture.md`: najpierw moduły bez zależności i bez API przeglądarki, potem audio, na końcu kontroler, render i UI. Model klas i modułów: `13-class-diagram.md`.

## 0. Etap 0: szkielet repozytorium

1. `npm create vite@latest` (vanilla-ts), dodanie `vitest`, `tsx`, `wrangler`, `@cloudflare/workers-types`.
2. Struktura katalogów zgodna z `README.md`: `src/{engine,game,audio,render,net,ui}`, `worker/`, `charts/`, `migrations/`, `scripts/`.
3. `tsconfig.json` z dwoma projektami: klient (`lib: DOM`) i Worker (`types: workers-types`, bez DOM). Moduły `engine/types`, `engine/chart`, `engine/scoring`, `engine/config` muszą się kompilować w obu, co wymusza brak odwołań do API przeglądarki. `resolveJsonModule` dla importu map w `charts/index.ts`.
4. Typy wspólne w `engine/types.ts` (`InstrumentId`, `Grade`, `PlayableNote`, `BackingNote`, `ScorePayload`). Bez osobnego pliku `chart.ts` i `session.ts` importowałyby się nawzajem.
5. Skrypty `package.json` z `07-deployment.md`. CI od razu z krokami `test` i `build`; krok `validate:charts` dochodzi w etapie 2 razem ze skryptem i pierwszą mapą, `deploy` w etapie 3.
6. Vitest w środowisku `node` dla `engine`; testy kontrolera z atrapą `AudioContext`.

Kryterium: `npm test` i `npm run build` przechodzą na pustym projekcie.

## 1. Etap 1: silnik i kalibracja

Kolejność implementacji (każdy punkt z testami Vitest przed następnym):

1. `engine/config.ts`:
```ts
export const CONFIG = {
  windowsMs: { perfect: 40, good: 90, ok: 150 },
  points: { perfect: 100, good: 60, ok: 30, miss: 0 },
  emptyTapPenalty: 10,
  approachTime: 1.2,   // s
  countdown: 3,        // s
  calibrationMaxSpreadMs: 40,
} as const;
```
2. `engine/scoring.ts`: `gradeFor` (na całkowitych ms) i `roundScore`:
```ts
export function roundScore(grades: Grade[], emptyTaps: number): number {
  const pts = grades.reduce((s, g) => s + CONFIG.points[g], 0);
  return Math.max(0, pts - emptyTaps * CONFIG.emptyTapPenalty);
}
```
3. `engine/judge.ts`: `judgeTap`, `nearestNote` według `03`, pkt 4. Ocena na `deltaMs = Math.round(delta * 1000)`, zapisywanym w nucie. Testy z `08-testing.md`.
4. `engine/chart.ts`, część bez walidacji: typy, `sec`, `expand`, `toPlayable`, `roundOffset`, `maxScore` (`04`, pkt 6). Potrzebne już tu, bo runda testowa wymaga listy nut grywalnych.
5. `engine/session.ts`, wersja minimalna: `start(chart, roundIndex, songStart)`, `onTap(tapTime)`, `update(now)` (oznaczanie `miss`, koniec rundy), liczenie `emptyTaps`. Czas przekazywany jako liczba, bez zależności od audio i DOM.
6. `engine/clock.ts`: `detectClockMethod` (z ponowieniem po 100 ms), `eventToAudioTime`.
7. `engine/calibration.ts`: `median`, `computeOffset` (parowanie z najbliższym uderzeniem, minimum 5 par), odczyt i zapis `{offset, method}` pod kluczem `hitline.calibration` w `try/catch`, unieważnienie przy innej metodzie zegara.
8. `audio/context.ts`: singleton `AudioContext({ latencyHint: 'interactive' })`, `unlock()` wołane w pierwszym geście.
9. `audio/synth.ts`: `play(instrument, when)`, współdzielony bufor szumu, limit polifonii 16, `stopAll()`, kompresor na wyjściu. Na początek `kick808`, `snare`, `hat`; reszta w etapie 2.
10. `game/controller.ts`: obsługa wejścia i start rundy.
    - `pointerdown` na kontenerze obszaru gry (`touch-action: none`); przycisk pauzy zatrzymuje propagację i nie jest liczony jako kliknięcie.
    - `keydown` dla spacji z `if (e.repeat) return`.
    - Przy `phase !== 'playing'` kliknięcie jest ignorowane.
    - Kolejno: `eventToAudioTime` -> odjęcie `calibrationOffset` -> `session.onTap` -> `synth.play`.
    - Start rundy: `songStart = currentTime + max(0.1, approachTime - notes[0].time)` (`03`, pkt 8).
    - Pętla rAF wywołuje `session.update(ctx.currentTime)`.
11. `render/canvas.ts`: pętla rAF z `03`, pkt 8, obsługa `devicePixelRatio`, linia trafienia, kółka, informacja o ocenie.
12. Ekran kalibracji: metronom 10 uderzeń zaplanowanych przez `start(when)`; czasy stuknięć liczone tą samą metodą zegara co w grze.
13. Ekran debug (`?debug=1`): `baseLatency`, `outputLatency`, metoda zegara, offset, FPS.
14. Wbudowana mapa testowa jako stała w kodzie (bez loadera i walidatora), jedna runda.

Kryteria ukończenia: jak w `10-roadmap.md`, etap 1; pierwszy pomiar opóźnienia wpisany do tabeli w `08-testing.md`.

## 2. Etap 2: rundy kumulatywne i punktacja

1. `engine/chart.ts`, reszta: `toBacking(chart, roundIndex, missed?: Set<number>)` z indeksem globalnym (`04`, pkt 6).
2. Walidator mapy: Zod dla struktury, osobna funkcja `validateSpacing(chart): string[]` zwracająca listę błędów (odstęp w sekundach, także na granicy pętli, gdy `loops > 1`). Podpiąć w trzech miejscach: loader klienta, `scripts/validate-charts.ts` (krok w CI), Worker.
3. `charts/index.ts` (eksport map jako `Record<string, Chart>`) i pierwsza pełna mapa: 5 rund, własna kompozycja, `ambient`.
4. `audio/scheduler.ts` według `03`, pkt 6, z parametrem `startIndex`.
5. `engine/session.ts`, wersja pełna: automat stanów `playing | paused | countdown | round-results`, zamknięcie rundy w chwili `max(koniec_ostatniej_pętli, ostatnia_nuta + windowsMs.ok)`, zapis nut rundy do `results`, `perRound`, przejście do kolejnej rundy.
6. Pauza i wznowienie w `game/controller.ts`: `visibilitychange`, przycisk, Esc; `resume()` według `resumeFromPause` z `03`, pkt 7 (plan wznowienia w czystej funkcji `game/pause.ts: planResume`); odliczanie rysuje `Renderer`.
7. UI: menu, karta mapy, wyniki rundy, wyniki mapy, pauza, odliczanie (`11-ux.md`). Do DOM wystarczy czysty TypeScript lub Preact; nie wprowadzaj frameworka do ścieżki gry (ADR-002).
8. ADR-006: wariant A (tło kompletne). Wariant B to przekazanie `missed` zbudowanego z `results`; decyzja po testach z graczami w etapie 5.

Testy: `toBacking` (kumulacja, `ambient`, sortowanie, `missed`), walidator (każda reguła z `04`, pkt 5), `session` z liczbowym czasem (pauza w środku rundy, koniec rundy po ostatniej pętli, kara nieschodząca poniżej 0, `results` po każdej rundzie), kontroler z atrapą `AudioContext` (brak nut tła z `time < pausePos` po wznowieniu, kliknięcia ignorowane w trakcie odliczania).

Kryteria ukończenia: jak w `10-roadmap.md`, etap 2.

## 3. Etap 3: backend i ranking

1. Przed kodem zweryfikować w dokumentacji Cloudflare: `run_worker_first` z tablicą wzorców, `[[ratelimits]]` i działanie limitera w `wrangler dev`, dostępność w planie darmowym (R-12), zachowanie D1 po przekroczeniu limitów (R-04).
2. `wrangler d1 create hitline`, `migrations/0001_init.sql`, migracja lokalna.
3. `worker/index.ts` ze szkieletu z `06`, pkt 4, plus:
   - ponawianie generowania kodu przy błędzie unikalności (pętla do 3 prób),
   - `worker/blocklist.ts` z normalizacją i regułą "krótkie słowa tylko z całym nickiem".
4. Testy API przez `wrangler dev` + Vitest: wszystkie przypadki brzegowe z `08`, pkt 2.
5. `net/api.ts`:
   - `201`: wynik zapisany;
   - `400`: komunikat o nicku, bez automatycznego ponawiania;
   - `429`, inne błędy i brak sieci: ranking niedostępny, wynik zachowany w `localStorage` do ponowienia.
6. UI rankingu, formularz nicka (komunikaty z `11-ux.md`, pkt 3).
7. Poziom 2 walidacji (ADR-007): klient buduje `hits` i `emptyTaps` z `SessionState.results`, serwer przelicza wynik przez `gradeFor` i `roundScore` z `engine/scoring` na tych samych całkowitych `deltaMs`.
8. Deploy: `db:migrate:remote`, `wrangler deploy`, sprawdzenie `meta.rows_written` dla `POST /api/scores`, test crona retencji.

## 4. Etap 4: wyzwania z kodem

`POST /api/challenges` i `GET /api/challenges/:code` są już w szkielecie Workera. Do zrobienia:

- odczyt `?c=` przy starcie, zamiana na wielkie litery i zapamiętanie do czasu przejścia z ekranu startowego;
- przycisk "Wyzwij znajomego" (kopiowanie linku przez `navigator.clipboard`, z `try/catch` i obejściem dla odmowy);
- komunikat dla `404`.

## 5. Etap 5: dopracowanie

Strojenie syntezy na słuch, 2-3 dodatkowe mapy, UX mobilny (blokada zoomu, `touch-action`), dostępność (WCAG AA, `prefers-reduced-motion`), ekran "O grze", `CREDITS.md` i `assets-register.csv`, wypełnienie macierzy z `08`, pkt 4, przegląd limitów (`09`, pkt 3), testy z graczami i decyzje w ADR-006 oraz ADR-011 (wysokość kary).

## 6. Kolejność ryzyk do zamknięcia

| Kiedy | Ryzyko | Jak zamknąć |
|---|---|---|
| Koniec etapu 1 | R-01, R-08 | pomiar opóźnień na min. 3 konfiguracjach, test `getOutputTimestamp` na 5 środowiskach |
| Koniec etapu 1 | R-09 | kalibracja z parowaniem do najbliższego uderzenia, próg rozrzutu sprawdzony na kilku osobach |
| Koniec etapu 2 | R-10 | test pauzy i wznowienia w macierzy (`08`, pkt 4) |
| Początek etapu 3 | R-04, R-12 | weryfikacja w dokumentacji i panelu, bez karty na koncie |
| Etap 3 | R-05, R-13, R-14 | poziom 2 walidacji, blocklista z testami |
| Etap 5 | R-15 | strojenie kary za puste kliknięcie w testach z graczami |

## 7. Poprawki naniesione do dokumentacji

Wcześniejsza lista poprawek z tego planu została przeniesiona do dokumentów źródłowych:

| Poprawka | Gdzie |
|---|---|
| Wznowienie po pauzie z `startIndex` w `Scheduler` | `03`, pkt 6-7; test w `08`, pkt 2 |
| Zapas przed pierwszą nutą, gdy wprowadzenie jest krótsze niż `approachTime` | `03`, pkt 8; `02`, pkt 4 |
| Parowanie stuknięć z najbliższym uderzeniem, minimum 5 par | `03`, pkt 5; testy w `08`, pkt 2 |
| Ocena na całkowitych `deltaMs`, okna w ms, `gradeFor` w `engine/scoring` | `01`, pkt 4; `03`, pkt 4; `06`, pkt 3 |
| Typy wspólne w `engine/types.ts` | `02`, pkt 3 i 5; `04`, pkt 6 |
| `run_worker_first = ["/api/*"]` | `07`, pkt 2 |
| Ponowienie wykrywania metody zegara po 100 ms | `03`, pkt 3 |
| `Session` jako czysta logika, `game/controller` | `02`, pkt 3-4 |
| `results` w stanie sesji, `missed` jako `Set<number>` | `02`, pkt 5; `04`, pkt 6 |

## 8. Decyzje otwarte

| Decyzja | Kiedy | Domyślnie do czasu decyzji |
|---|---|---|
| ADR-006 (tło po chybieniu) | etap 5, po testach z graczami | wariant A |
| ADR-011 (wysokość kary) | etap 5, po testach z graczami | 10 punktów |
| Poziom walidacji | etap 3 | poziom 1, poziom 2 jeśli zostaje czas |
| Osobne suwaki audio/wideo | po pomiarach w etapie 1 | jeden offset |
| Framework UI poza grą | etap 2 | czysty TS |
