# 09. Ryzyka i decyzje architektoniczne

## 1. Rejestr ryzyk

| ID | Ryzyko | Prawdopodobieństwo | Wpływ | Działanie |
|---|---|---|---|---|
| R-01 | Duże opóźnienie wyjścia audio (np. Bluetooth) psuje odczucie rozgrywki | wysokie | wysoki | kalibracja, komunikat o zalecanym sprzęcie, pomiary w `08-testing.md` |
| R-02 | Przeglądarka blokuje audio do czasu gestu | pewne | średni | ekran startowy z gestem, `resume()` |
| R-03 | Wyczerpanie dziennego limitu żądań Workera (100 000/dzień) lub zapisów D1 | niskie na starcie | średni | cache rankingu, limiter zapisów, monitorowanie, plan wyjścia (patrz niżej) |
| R-04 | Niejasne zachowanie D1 po przekroczeniu limitów darmowych (dokumentacja FAQ wspomina o naliczaniu opłat) | niepewne | wysoki | zweryfikować w dokumentacji i panelu przed publikacją; nie podpinać metody płatności |
| R-05 | Fałszowanie wyników w rankingu | wysokie przy popularności | niski do średni | poziomy walidacji (`06-backend-and-data.md`, ADR-007) |
| R-06 | Naruszenie praw autorskich przez treści muzyczne | zależy od treści | wysoki | własne beaty i synteza, rejestr licencji (`05-audio-assets.md`, ADR-005) |
| R-07 | Zmiana limitów lub warunków darmowych planów | średnie | średni | przegląd limitów co kwartał, abstrakcja warstwy danych |
| R-08 | Różnice zachowania Web Audio między przeglądarkami | średnie | średni | macierz testów, metoda zapasowa w `clock.ts`, metoda zapisana z kalibracją (ADR-010) |
| R-09 | Zbyt duży rozrzut kalibracji u graczy (niespójne stukanie) | średnie | niski | próg rozrzutu, ponowna kalibracja, mediana |
| R-10 | Karta w tle zaburza scheduler | wysokie | niski | pauza przy `visibilitychange`, wznowienie z odliczaniem |
| R-11 | Wyciek tokenów wdrożeniowych | niskie | wysoki | minimalne uprawnienia tokenu, sekrety w CI, brak sekretów w repozytorium |
| R-12 | Rate Limiting w Workers niedostępny w darmowym planie lub o innej składni | niepewne | średni | zweryfikować przed etapem 3; bez limitera zapisy działają bez ograniczeń (R-03) |
| R-13 | Obraźliwe nicki w publicznym rankingu | wysokie przy popularności | średni | lista zakazanych słów, procedura ręcznego usuwania (`06-backend-and-data.md`, pkt 5) |
| R-14 | Fałszywe odrzucenia niewinnych nicków przez listę zakazanych słów | średnie | niski | porównanie krótkich słów tylko z całym nickiem, czytelny komunikat, korekta listy |
| R-15 | Mashowanie (klikanie na oślep) przy jednym przycisku | wysokie | średni | kara za puste kliknięcie (`01-requirements.md`, pkt 4); strojenie wartości kary po testach |

Plan wyjścia dla R-03 i R-07: logika danych jest ukryta za cienkim interfejsem (`net/api.ts` po stronie klienta, funkcje dostępu do danych po stronie Workera), więc zamiana bazy lub platformy dotyka niewielkiej części kodu.

## 2. Zapisy decyzji (ADR)

### ADR-001: Platforma hostingu i API

- **Status:** przyjęta.
- **Kontekst:** dotychczasowy stack to Vite + Vercel + Firebase (RTDB, Firestore). Projekt jest ciężki w statykach audio, ma mały backend rankingu i nie wymaga synchronizacji w czasie rzeczywistym.
- **Rozważane opcje i istotne limity (stan na 2026-10-06, do weryfikacji):**
  - Vercel Hobby: 100 GB transferu danych i 1 mln wywołań funkcji; użycie wyłącznie niekomercyjne.
  - Firebase Spark: Firestore 50 tys. odczytów dziennie (liczone per dokument); RTDB 100 jednoczesnych połączeń.
  - Cloudflare Workers Free: statyki bez limitu, 100 000 żądań/dzień do Workera, 10 ms CPU, D1: 5 mln odczytów i 100 tys. zapisów wierszy dziennie, 5 GB.
- **Decyzja:** Cloudflare (Workers ze statykami + D1), Vite jako narzędzie budowania.
- **Konsekwencje:** jedna platforma i jeden deploy; własny kod walidacji w Workerze; konieczność weryfikacji zachowania limitów (R-04); brak SDK klienckiego z regułami bezpieczeństwa.
- **Źródła:** `developers.cloudflare.com/workers/platform/pricing/`, `.../limits/`, `developers.cloudflare.com/d1/platform/pricing/`, `vercel.com/docs/limits`, `firebase.google.com/pricing`.

### ADR-002: Canvas 2D zamiast DOM/frameworka w pętli gry

- **Status:** przyjęta.
- **Kontekst:** potrzebne stabilne 60 FPS i brak narzutu rekoncyliacji interfejsu w ścieżce krytycznej.
- **Decyzja:** rysowanie kółek na Canvas 2D; UI poza grą (menu, wyniki, kalibracja) może używać zwykłego DOM lub lekkiego frameworka.
- **Konsekwencje:** ręczne zarządzanie rysowaniem i hit-testami; proste skalowanie na wysokie DPI wymaga obsługi `devicePixelRatio`.

### ADR-003: Jeden zegar (AudioContext) i scheduler z wyprzedzeniem

- **Status:** przyjęta.
- **Kontekst:** timery JavaScript mają jitter i są ograniczane w tle.
- **Decyzja:** wszystkie czasy w skali `AudioContext.currentTime`; dźwięki tła planowane z wyprzedzeniem; trafienia graczy odtwarzane natychmiast.
- **Konsekwencje:** wymagane przeliczanie czasu zdarzeń wejścia na skalę audio; testy zgodności przeglądarek (`08-testing.md`).

### ADR-004: D1 zamiast Firestore dla rankingu

- **Status:** przyjęta.
- **Kontekst:** ranking to zapis przy każdej grze i odczyt top N.
- **Decyzja:** D1 z indeksem `(chart_id, score DESC)`.
- **Konsekwencje:** zapytania SQL i migracje zamiast dokumentów; większa pojemność odczytów i zapisów w darmowym planie niż w Firestore Spark; brak zapytań w czasie rzeczywistym (niepotrzebne w tej wersji).
- **Uwaga:** jeśli w przyszłości pojawią się pokoje wieloosobowe, rozważ Durable Objects (do przeanalizowania osobno).

### ADR-005: Własne beaty i synteza zamiast licencjonowanych piosenek

- **Status:** przyjęta.
- **Kontekst:** istniejące nagrania i kompozycje są chronione, a licencjonowanie wymaga umów z wytwórniami i wydawcami.
- **Decyzja:** instrumenty syntezowane lub z licencją CC0/jawną; mapy to własne kompozycje; bez tytułów i nazw artystów w interfejsie.
- **Konsekwencje:** mniejsze ryzyko prawne; brak rozpoznawalnych utworów, więc mniejsza atrakcyjność dla części graczy. Dokument nie jest poradą prawną.

### ADR-006: Zachowanie warstwy tła po chybieniu nuty

- **Status:** do podjęcia po testach z graczami w etapie 5; do tego czasu obowiązuje wariant A.
- **Opcje:** (A) tło zawsze kompletne; (B) chybiona nuta pozostaje cicha w kolejnych rundach (ta sama pozycja w tej samej pętli, patrz `04-chart-format.md`, pkt 4).
- **Kryterium wyboru:** odczucie postępu w budowaniu beatu vs. czytelność konsekwencji błędów.

### ADR-007: Poziom ochrony rankingu

- **Status:** przyjęta dla wersji 1: poziom 1 (walidacja formalna, lista zakazanych nicków, limiter zapisów). Poziom 2 (odtworzenie wyniku z `hits` i `emptyTaps`) planowany w etapie 3.
- **Kontekst:** ranking publiczny bez kont jest podatny na fałszerstwa.
- **Konsekwencje:** wyniki w wersji 1 mają niski poziom zaufania; nie wiąż z rankingiem nagród ani wartości materialnych.

### ADR-008: Składanie tła w trakcie gry i warstwa `ambient`

- **Status:** przyjęta.
- **Kontekst:** pierwotny format miał statyczne `layers` i `backing`, a reguły kumulacji jednocześnie zakładały tło składane z poprzednich rund. Dwa modele były sprzeczne i powodowały duplikację nut.
- **Opcje:** (A) tylko tło składane w trakcie gry; (B) tylko statyczne warstwy; (C) hybryda.
- **Decyzja:** (C). Tło rundy N to nuty `play` rund 1..N-1 oraz opcjonalna warstwa `ambient`, nigdy grana przez gracza. Runda to pętla `lengthBeats` powtórzona `loops` razy; między rundami jest pauza z ekranem wyników.
- **Konsekwencje:** brak duplikacji, wariant B z ADR-006 pozostaje możliwy; `maxScore` i indeksy nut uwzględniają pętle (`04-chart-format.md`).

### ADR-009: Dopasowanie kliknięcia i minimalny odstęp nut

- **Status:** przyjęta.
- **Kontekst:** jeden przycisk i okno `ok` +/- 150 ms. Odstęp nut liczony w beatach (0,125 beata) dawał przy wysokim BPM około 31 ms, czyli nakładające się okna.
- **Opcje:** (A) odstęp >= 2 × okno `ok`; (B) odstęp >= okno `ok` i dopasowanie do najwcześniejszej nuty w oknie; (C) okna zawężane dynamicznie.
- **Decyzja:** (B). Odstęp liczony w sekundach, sprawdzany także na granicy pętli.
- **Konsekwencje:** dopuszczalne ósemki przy typowym tempie; bardzo wczesne kliknięcie może zaliczyć poprzednią nutę zamiast następnej.

### ADR-010: Metoda przeliczania czasu kliknięcia

- **Status:** przyjęta.
- **Kontekst:** `getOutputTimestamp` i metoda zapasowa różnią się mniej więcej o opóźnienie wyjścia audio. Offset kalibracji jest ważny tylko dla metody, którą go zmierzono.
- **Opcje:** (A) zawsze metoda zapasowa; (B) `getOutputTimestamp`, jeśli działa, z metodą zapisaną przy offsecie; (C) metoda przypisana do przeglądarki.
- **Decyzja:** (B). Metoda wybierana raz na sesję przez `detectClockMethod`; zmiana metody unieważnia zapisany offset.
- **Konsekwencje:** dokładniejszy czas tam, gdzie API działa poprawnie; przy aktualizacji przeglądarki gracz może zostać poproszony o ponowną kalibrację.

### ADR-011: Puste kliknięcie

- **Status:** przyjęta; wartość kary do strojenia po testach.
- **Kontekst:** przy jednym przycisku klikanie na oślep nie miało kosztu (R-15).
- **Decyzja:** puste kliknięcie odtwarza instrument nuty najbliższej w czasie i obniża wynik rundy o `CONFIG.emptyTapPenalty` (10 punktów); wynik rundy nie spada poniżej 0. Dźwięk trafienia i pustego kliknięcia jest odtwarzany natychmiast, bez wyrównania do siatki rytmu.
- **Konsekwencje:** serwer w poziomie 2 potrzebuje `emptyTaps` per runda; dźwięk pustego kliknięcia brzmi jak spóźnione lub przedwczesne trafienie, co trzeba sprawdzić w testach z graczami.

### ADR-012: Moderacja, ranking i prywatność

- **Status:** przyjęta.
- **Decyzja:**
  - nicki: lista zakazanych słów w Workerze oraz udokumentowana procedura ręcznego usuwania wpisów;
  - ranking: wszystkie wpisy, bez grupowania po graczu;
  - limitowanie: wbudowany Rate Limiting w Workers, 10 zapisów na 60 s na IP (R-12);
  - prywatność: brak zapisu IP, retencja top 1000 wyników na mapę przez codzienny Cron Trigger.
- **Konsekwencje:** jeden gracz może zająć wiele miejsc w top 50; usuwanie wpisów jest ręczne; wymagana weryfikacja dostępności limitera.

### ADR-013: `Session` jako czysta logika, `game/controller` jako warstwa łącząca

- **Status:** przyjęta.
- **Kontekst:** pierwsza wersja diagramu klas dawała `Session` zależność od DOM i audio (`onTap(rawEvent)`, posiadanie `Scheduler`), co łamało zasadę testowalności `engine` bez przeglądarki.
- **Opcje:** (A) osobny `game/controller.ts`; (B) kontroler w `ui/round.ts`; (C) `Session` zależna od audio.
- **Decyzja:** (A). `Session` dostaje czas jako liczbę (`onTap(tapTime)`, `update(now)`); kontroler przelicza zdarzenia, odtwarza dźwięki, zarządza `Scheduler` i pauzą.
- **Konsekwencje:** testy `session` w Node bez atrap Web Audio; jeden dodatkowy katalog `src/game/`; testy kontrolera wymagają atrapy `AudioContext`.

### ADR-014: Ocena na całkowitych milisekundach

- **Status:** przyjęta.
- **Kontekst:** w walidacji poziomu 2 serwer dostaje `deltaMs` jako liczbę całkowitą. Ocena klienta na dokładnej delcie mogłaby różnić się od oceny serwera na granicach okien (np. 40,4 ms: klient `good`, serwer `perfect`).
- **Opcje:** (A) okna w całych ms i ocena na `Math.round(delta * 1000)`; (B) okna w sekundach i zaokrąglanie delty przed porównaniem.
- **Decyzja:** (A). `CONFIG.windowsMs`, `gradeFor` w `engine/scoring` współdzielonym z Workerem; `deltaMs` zapisywane w nucie i wysyłane bez zmian.
- **Konsekwencje:** identyczna ocena po obu stronach; rozdzielczość oceny 1 ms, pomijalna wobec opóźnień wejścia i wyjścia.

### ADR-015: Wysokość dźwięku w nucie

- **Status:** przyjęta.
- **Kontekst:** `bass808` i `string` grały stałą częstotliwość, więc mapa nie mogła zapisać linii basu ani akordów.
- **Opcje:** (A) opcjonalne pole `p` z numerem nuty MIDI; (B) osobne instrumenty dla każdej wysokości; (C) brak wysokości w wersji 1.
- **Decyzja:** (A). `p` przechodzi do `BackingNote.pitch` i `synth.play(instrument, when, pitch?)`; puste kliknięcie gra wysokość najbliższej nuty.
- **Konsekwencje:** format pozostaje w wersji 1 (pole opcjonalne); walidator odrzuca `p` dla instrumentów bez wysokości; ocena trafień nie zależy od `p`.

### ADR-016: Walidacja map poza klientem

- **Status:** przyjęta.
- **Kontekst:** walidacja Zod w kliencie zwiększała paczkę JS z ok. 6 KB do ok. 32 KB (gzip), choć mapy są statyczne i sprawdzane w CI.
- **Opcje:** (A) walidacja w kliencie, CI i Workerze; (B) walidacja tylko w CI i Workerze.
- **Decyzja:** (B). Walidator w osobnym module `engine/validate.ts`, importowanym przez `scripts/validate-charts.ts`, testy i Worker; `charts/index.ts` rzutuje JSON na `Chart`.
- **Konsekwencje:** mała paczka klienta; błędna mapa może trafić do klienta tylko z pominięciem CI. Mapy ładowane dynamicznie (spoza buildu) wymagałyby powrotu do walidacji w kliencie.

## 3. Procedura przeglądu limitów

Co kwartał oraz przed każdym wdrożeniem publicznym:

1. Otwórz strony z limitami (źródła w ADR-001).
2. Porównaj z tabelą w `06-backend-and-data.md`.
3. Zaktualizuj dokumentację i datę weryfikacji.
4. Sprawdź warunki użytkowania pod kątem zastosowań komercyjnych, jeśli planujesz monetyzację.
