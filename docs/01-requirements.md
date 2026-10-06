# 01. Wymagania

## 1. Zakres

Gra przeglądarkowa dla jednego gracza z rankingiem online. Rozgrywka działa w całości po stronie klienta. Serwer obsługuje wyłącznie ranking i kody wyzwań.

Poza zakresem pierwszej wersji: konta użytkowników, pokoje wieloosobowe, własne piosenki wgrywane przez graczy, licencjonowane utwory komercyjne.

## 2. Wymagania funkcjonalne

| ID | Wymaganie | Priorytet |
|---|---|---|
| FR-01 | Gracz wybiera mapę (utwór) z listy. | wysoki |
| FR-02 | Mapa składa się z 5 rund. Runda to pętla nut powtórzona `loops` razy. Runda N dokłada warstwę instrumentów do rund 1..N-1. | wysoki |
| FR-03 | Kółka spadają do linii trafienia; gracz klika w momencie ich dotarcia. | wysoki |
| FR-04 | Każde trafienie odtwarza natychmiast dźwięk przypisany do nuty. | wysoki |
| FR-05 | Warstwy z poprzednich rund i opcjonalna warstwa `ambient` mapy odtwarzają się automatycznie w tle. | wysoki |
| FR-06 | Punktacja zależy od błędu czasu trafienia (perfect / good / ok / miss). | wysoki |
| FR-07 | Ekran kalibracji mierzy stałe przesunięcie czasowe urządzenia i zapisuje je lokalnie. | wysoki |
| FR-08 | Ekran wyników po rundzie (pauza przed kolejną rundą) i po całej mapie. | wysoki |
| FR-09 | Wynik końcowy można wysłać do rankingu (nick, wynik, mapa). | średni |
| FR-10 | Ranking top 50 per mapa; ten sam nick może występować wielokrotnie. | średni |
| FR-11 | Kod wyzwania (parametr `c` w URL) otwiera wskazaną mapę. | niski |
| FR-12 | Obsługa myszy, dotyku i klawisza (spacja). Na urządzeniach dotykowych cały obszar gry przyjmuje kliknięcie. | wysoki |
| FR-13 | Kliknięcie poza oknem nuty odtwarza dźwięk instrumentu najbliższej nuty i obniża wynik rundy o karę (pkt 4). | wysoki |
| FR-14 | Gra wstrzymuje się po ukryciu karty lub na żądanie gracza; wznowienie po geście i odliczaniu 3 s. | wysoki |
| FR-15 | Nicki z listy zakazanych słów są odrzucane przy zapisie wyniku. | średni |

## 3. Wymagania niefunkcjonalne

| ID | Wymaganie | Miara |
|---|---|---|
| NFR-01 | Opóźnienie wejście -> dźwięk (urządzenie stacjonarne, przewodowe wyjście audio) | cel < 30 ms, mierzone zgodnie z `08-testing.md` |
| NFR-02 | Płynność animacji | stabilne 60 FPS na urządzeniu średniej klasy |
| NFR-03 | Czas do możliwości interakcji (łącze szerokopasmowe) | cel < 2 s |
| NFR-04 | Rozmiar początkowego pakietu (JS + wymagane zasoby) | cel < 300 KB po kompresji, bez próbek audio |
| NFR-05 | Dostępność rozgrywki bez backendu | gra działa, gdy API jest niedostępne; ranking jest funkcją opcjonalną |
| NFR-06 | Koszt utrzymania | 0 zł na darmowym planie Cloudflare w zakładanym ruchu (patrz `06-backend-and-data.md`) |
| NFR-07 | Przeglądarki | aktualne Chrome, Firefox, Safari (desktop), Chrome i Safari (mobile) |

Wartości docelowe są założeniami projektowymi do zweryfikowania pomiarem, a nie gwarancją.

## 4. Punktacja (wartości domyślne)

Błąd czasu `delta = czas_kliknięcia - czas_nuty`, po uwzględnieniu kalibracji.

| Ocena | Warunek | Punkty |
|---|---|---|
| perfect | abs(delta) <= 40 ms | 100 |
| good | abs(delta) <= 90 ms | 60 |
| ok | abs(delta) <= 150 ms | 30 |
| miss | abs(delta) > 150 ms lub brak kliknięcia | 0 |
| puste kliknięcie | kliknięcie poza oknem `ok` każdej nuty | -10 |

Wynik rundy: `max(0, suma_punktów_trafień - liczba_pustych_kliknięć * 10)`. Wynik mapy to suma wyników rund.

Maksymalny wynik mapy: `liczba_nut_grywalnych * 100`, gdzie liczba nut grywalnych uwzględnia powtórzenia pętli (`loops`). Wartość ta jest używana przez serwer do walidacji (patrz `06-backend-and-data.md`).

Progi i kara są parametrami konfiguracyjnymi (`src/engine/config.ts`) i mogą zostać zmienione po testach z graczami.

## 5. Ograniczenia

- Brak plików audio pochodzących z istniejących nagrań (patrz `05-audio-assets.md`).
- Ranking opiera się na wynikach z klienta, więc jest podatny na fałszowanie. Poziom zaufania opisano w `06-backend-and-data.md`.
