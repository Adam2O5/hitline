# 09. Ryzyka i decyzje architektoniczne

## 1. Rejestr ryzyk

| ID | Ryzyko | Prawdopodobieństwo | Wpływ | Działanie | Status (2026-10-07) |
|---|---|---|---|---|---|
| R-01 | Duże opóźnienie wyjścia audio (np. Bluetooth) psuje odczucie rozgrywki | wysokie | wysoki | kalibracja, komunikat o zalecanym sprzęcie, pomiary w `08-testing.md` | ograniczone w kodzie (kalibracja, komunikat); otwarte: pomiary na min. 3 konfiguracjach (autor) |
| R-02 | Przeglądarka blokuje audio do czasu gestu | pewne | średni | ekran startowy z gestem, `resume()` | zamknięte: wdrożone (`audio/context.ts`, ekran startowy) |
| R-03 | Wyczerpanie dziennego limitu żądań Workera (100 000/dzień) lub zapisów D1 | niskie na starcie | średni | cache rankingu, limiter zapisów, monitorowanie, plan wyjścia (patrz niżej) | ograniczone: cache 30 s, 2 zapisane wiersze na wynik (pomiar), `503` i ponowienie po stronie klienta; monitorowanie w panelu po pierwszym tygodniu ruchu |
| R-04 | Zachowanie D1 po przekroczeniu limitów darmowych | zweryfikowane | niski | w planie Free zapytania kończą się błędem do 00:00 UTC, bez opłat; Worker zwraca `503`, klient zachowuje wynik lokalnie; nie podpinać metody płatności, bo plan Paid nalicza opłaty za nadwyżkę | zamknięte: zweryfikowane w dokumentacji |
| R-05 | Fałszowanie wyników w rankingu | wysokie przy popularności | niski do średni | poziomy walidacji (`06-backend-and-data.md`, ADR-007) | ograniczone: poziom 2 wdrożony; poziom 3 w backlogu |
| R-06 | Naruszenie praw autorskich przez treści muzyczne i zasoby zewnętrzne | zależy od treści | wysoki | własne beaty i synteza, rejestr licencji (`05-audio-assets.md`, ADR-005) | ograniczone: tylko synteza i autorskie mapy; jedyny zasób zewnętrzny to czcionka Anton (OFL 1.1) wpisana w `assets-register.csv`, `CREDITS.md` i „O grze”; każda nowa mapa lub zasób wymaga wpisu |
| R-07 | Zmiana limitów lub warunków darmowych planów | średnie | średni | przegląd limitów co kwartał, abstrakcja warstwy danych | otwarte, cykliczne: ostatni przegląd 2026-10-07, następny do 2027-01-07 |
| R-08 | Różnice zachowania Web Audio między przeglądarkami | średnie | średni | macierz testów, metoda zapasowa w `clock.ts`, metoda zapisana z kalibracją (ADR-010) | ograniczone w kodzie; otwarte: macierz w `08`, pkt 4 (autor) |
| R-09 | Zbyt duży rozrzut kalibracji u graczy (niespójne stukanie) | średnie | niski | próg rozrzutu, ponowna kalibracja, mediana | ograniczone w kodzie; próg 40 ms do sprawdzenia w testach z graczami |
| R-10 | Karta w tle zaburza scheduler | wysokie | niski | pauza przy `visibilitychange`, wznowienie z odliczaniem | ograniczone w kodzie; otwarte: kolumna „Pauza i wznowienie” w macierzy (autor) |
| R-11 | Wyciek tokenów wdrożeniowych | niskie | wysoki | minimalne uprawnienia tokenu, sekrety w CI, brak sekretów w repozytorium | ograniczone: wdrożenie ręczne przez `wrangler login`, brak tokenów w repozytorium i CI |
| R-12 | Rate Limiting w Workers niedostępny w darmowym planie lub o innej składni | niepewne | średni | składnia `[[ratelimits]]` z `namespace_id` i `[ratelimits.simple]` (okres tylko 10 lub 60 s); działa w `wrangler dev`. Dokumentacja odradza klucz z IP (wspólne adresy w sieciach komórkowych); przy fałszywych `429` podnieść limit | otwarte: na produkcji 15 szybkich żądań nie dało `429` (licznik jest ostatecznie spójny); do powtórzenia wolniejszy test (25 żądań co 1 s). Bez limitera zapisy chronią tylko walidacja i budżet D1 (R-03) |
| R-13 | Obraźliwe nicki w publicznym rankingu | wysokie przy popularności | średni | lista zakazanych słów, procedura ręcznego usuwania (`06-backend-and-data.md`, pkt 5) | ograniczone: `worker/blocklist.ts` z testami; lista do uzupełniania |
| R-14 | Fałszywe odrzucenia niewinnych nicków przez listę zakazanych słów | średnie | niski | porównanie krótkich słów tylko z całym nickiem, czytelny komunikat, korekta listy | ograniczone: wdrożone i przetestowane |
| R-15 | Mashowanie (klikanie na oślep) przy jednym przycisku | wysokie | średni | kara za puste kliknięcie (`01-requirements.md`, pkt 4); strojenie wartości kary po testach | ograniczone: kara 10 pkt; otwarte: wartość do decyzji po testach z graczami (ADR-011) |
| R-16 | Czcionka nie załaduje się przed pierwszą klatką lub zawiedzie | niskie | niski | `loadFonts()` z limitem 1,5 s, fallback Impact / Arial Narrow Bold, `fitFont` łagodzi różnice szerokości | ograniczone w kodzie; otwarte: test polskich znaków na urządzeniu bez Antona (`14`, pkt 11) |

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

- **Status:** przyjęta dla wersji 1: poziomy 1 i 2 (walidacja formalna, lista zakazanych nicków, limiter zapisów, odtworzenie wyniku z `hits` i `emptyTaps`, wymaganych w każdym zapisie). Wdrożone w etapie 3 (`worker/scores.ts`).
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

### ADR-017: Styl wizualny Back Alley, bez abstrakcji motywów

- **Status:** przyjęta.
- **Kontekst:** dotychczasowy wygląd był domyślny (niebieskie przyciski, kolory per instrument). Rozważono pięć kierunków w podglądach (Aurora, Neon Grid, Back Alley, Clean, Pixel LCD).
- **Opcje:** (A) jeden styl zapisany bezpośrednio w `Renderer` i `style.css`; (B) interfejs `Theme` z wymiennymi stylami; (C) wiele stylów wybieranych przez gracza.
- **Decyzja:** (A), styl Back Alley. Paleta w tokenach CSS jako jedyne źródło kolorów (renderer czyta je raz), czcionka Anton ładowana lokalnie z pakietu, nuty w jednym kolorze (złoty), bez kolorów instrumentów. Opis w `14-visual-style.md`.
- **Konsekwencje:** prostszy kod i szybszy renderer; dodanie drugiego motywu wymaga wydzielenia interfejsu `Theme`. Pierwszy zasób zewnętrzny w repozytorium (R-06, R-16). Instrument rozróżnia tylko napis, co wystarcza, bo runda gra zwykle jednym instrumentem.

## 3. Procedura przeglądu limitów

Co kwartał oraz przed każdym wdrożeniem publicznym:

1. Otwórz strony z limitami (źródła w ADR-001).
2. Porównaj z tabelą w `06-backend-and-data.md`.
3. Zaktualizuj dokumentację i datę weryfikacji.
4. Sprawdź warunki użytkowania pod kątem zastosowań komercyjnych, jeśli planujesz monetyzację.
