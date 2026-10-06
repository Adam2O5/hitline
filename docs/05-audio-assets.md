# 05. Zasoby dźwiękowe

## 1. Strategia

1. Domyślnie wszystkie instrumenty są **syntezowane w Web Audio API**. Brak plików, brak ładowania, brak kwestii licencyjnych poza własnym kodem.
2. Pliki z próbkami są dopuszczalne wyłącznie z licencją CC0 lub inną jawną, kompatybilną z dystrybucją w aplikacji webowej. Każdy plik musi mieć wpis w rejestrze (pkt 4).
3. Żadne pliki, fragmenty ani próbki nie pochodzą z istniejących nagrań komercyjnych.

## 2. Instrumenty i parametry syntezy

Wartości startowe, do strojenia na słuch. Zmiany zapisuj w historii repozytorium.

| ID | Technika | Parametry startowe |
|---|---|---|
| `kick808` | oscylator sinusowy z opadającą częstotliwością | start 150 Hz, koniec 45 Hz w 0,12 s; obwiednia amplitudy do ~0,8 s |
| `snare` | szum przefiltrowany (górnoprzepustowy) + krótki ton trójkątny | filtr ~1500 Hz; szum 0,2 s; ton 220 Hz, 0,1 s |
| `clap` | 3-4 krótkie impulsy szumu przez filtr pasmowy, ostatni dłuższy | filtr ~1200 Hz; impulsy co ~12 ms |
| `hat` | szum przez filtr górnoprzepustowy, bardzo krótka obwiednia | HP ~7000 Hz; zanik ~0,04 s |
| `openhat` | jak `hat`, dłuższy zanik | zanik ~0,25 s |
| `bass808` | oscylator sinusowy z lekkim nasyceniem | częstotliwość z nuty, zanik ~0,6 s |
| `string` | kilka oscylatorów piłokształtnych z lekkim rozstrojeniem + filtr dolnoprzepustowy | 3 głosy, +/- 7 cent, atak ~0,05 s |
| `perc` | krótki sinusoidalny ping z szybkim zanikiem | 800 Hz, zanik ~0,08 s |

Szczegółowa implementacja znajduje się w `src/audio/synth.ts`. Każda funkcja ma sygnaturę `(when: number) => void` i tworzy węzły jednorazowe, zatrzymywane po zaniku.

### Zasady implementacyjne

- Bufor szumu generowany raz przy starcie i współdzielony.
- Brak tworzenia kontekstów audio per dźwięk.
- Ograniczenie jednoczesnych źródeł (polifonia); najstarsze dźwięki są ucinane z krótkim zanikiem, nie nagle.
- `stopAll()` zatrzymuje z krótkim zanikiem wszystkie aktywne i zaplanowane źródła; używane przy pauzie (`03-timing-and-latency.md`, pkt 7).
- Kompresor/limiter na wyjściu głównym, by suma warstw nie przesterowywała.

## 3. Pliki audio (opcjonalnie)

Jeśli synteza nie wystarcza dla wybranego instrumentu:

- Format: mono, 44,1 kHz lub 48 kHz, krótkie próbki (poniżej 1-2 s).
- Pliki dekodowane do `AudioBuffer` przy ładowaniu ekranu, nigdy w trakcie gry.
- Nazwa zawiera skrót treści (hash) dla długiego cache, np. `snare.3f9a1c.ogg`.
- Format kontenera dobierz do macierzy przeglądarek (`08-testing.md`); zapewnij format kompatybilny z Safari.

## 4. Rejestr zasobów

Każdy plik zewnętrzny musi mieć wpis w `docs/assets-register.csv` oraz, jeśli licencja tego wymaga, w `CREDITS.md`.

| Kolumna | Opis |
|---|---|
| `file` | ścieżka w repozytorium |
| `name` | nazwa próbki |
| `author` | autor |
| `source_url` | adres strony źródłowej |
| `license` | nazwa i wersja licencji |
| `license_url` | link do tekstu licencji |
| `attribution_required` | tak / nie |
| `downloaded_at` | data pobrania |
| `modified` | tak / nie, opis zmian |

Szablon nagłówka:

```csv
file,name,author,source_url,license,license_url,attribution_required,downloaded_at,modified
```

## 5. Zasady wyboru licencji

1. Preferuj CC0 (brak wymagań atrybucji).
2. Licencje z atrybucją są dopuszczalne, jeśli wpis trafi do `CREDITS.md` i do ekranu "O grze".
3. Licencje z klauzulą NonCommercial wykluczają użycie, jeśli projekt kiedykolwiek miałby charakter komercyjny (reklamy, sprzedaż); nie używaj ich, jeśli nie jesteś pewny.
4. Licencje z klauzulą NoDerivatives wykluczają przetwarzanie próbek.
5. Przy braku wyraźnej licencji traktuj plik jako chroniony i nie używaj go.
6. Warunki darmowych paczek często zabraniają ponownej dystrybucji samych plików, nawet jeśli pozwalają na użycie w produkcji. Przeczytaj licencję konkretnej paczki, a nie ogólną reputację serwisu.

Dokument nie jest poradą prawną. W razie wątpliwości przy zastosowaniach komercyjnych skonsultuj licencje z prawnikiem.

## 6. Kompozycje i mapy

- Mapy są własnymi kompozycjami lub aranżacjami wzorców ogólnych (np. typowy wzorzec perkusji w danym gatunku).
- Nie koduj w mapie charakterystycznej melodii ani linii basu konkretnego, chronionego utworu.
- W nazwach map nie używaj tytułów i nazw artystów bez wyraźnej podstawy prawnej.
