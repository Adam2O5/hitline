# 14. Styl wizualny: Back Alley

Dokument opisuje warstwę wizualną: paletę, typografię, układ canvasu, efekty i zasady dostępności. Nie zmienia żadnej logiki gry (czas, ocena, punktacja: `01`, `03`). Decyzja o wyborze stylu: ADR-017 w `09-risks-and-decisions.md`.

## 1. Założenia

- Mroczny styl rapowy: czerń, ziarno, pochylony napis instrumentu, złote krążki jak płyty winylowe, taśma ostrzegawcza jako linia trafienia, drżenie sceny przy trafieniu.
- Jedno źródło kolorów: tokeny w `:root` w `src/style.css`. `Renderer` odczytuje je raz w konstruktorze (`getComputedStyle`), więc DOM i canvas używają tej samej palety, a zmiana koloru nie wymaga edycji `canvas.ts`.
- Brak abstrakcji motywów. Jeśli pojawi się drugi styl, wydziel interfejs `Theme` z `Renderer` (ADR-017).
- Style nie zmieniają zachowania gry. `Renderer.draw` i `Renderer.feedback` mają niezmienione sygnatury.

## 2. Paleta

Kontrast liczony wg WCAG 2.x względem `--ink`. Wartości pilnuje test `src/style.test.ts`, który czyta tokeny z `style.css`.

| Token | Wartość | Użycie | Kontrast na `--ink` |
|---|---|---|---|
| `--ink` | `#0a0a0a` | tło, obrysy, tekst na złocie | |
| `--ink-2` | `#161616` | przyciski wtórne, pola formularzy | |
| `--paper` | `#f4f4f0` | tekst, naklejka, ziarno, ring fokusa | 17,96:1 |
| `--gold` | `#e8b923` | przyciski, krążki, taśma, wynik | 10,74:1 |
| `--blood` | `#d4141c` | cienie dużych napisów, błysk taśmy, `-10` | 3,69:1 |
| `--mute` | `#9a9a9a` | `.hint`, chybione nuty | 7,04:1 |
| `--line` | `#2a2a2a` | oś środkowa canvasu | |

Czerwień (`--blood`) spełnia 3:1, ale nie 4,5:1, więc jest używana wyłącznie dla dużego tekstu i dekoracji. Tekst ostrzeżeń (`.warn`) jest złoty.

## 3. Typografia

- Nagłówki, przyciski, napisy w canvasie: Anton 400 (`--display`), wielkie litery. Fallback: `Impact, "Arial Narrow Bold", sans-serif`. Tekst ciągły: `system-ui` (`--body`).
- Anton ma jedną wagę, więc `font-synthesis: none` blokuje sztuczne pogrubianie.
- Czcionka jest pakowana w buildzie (`@fontsource/anton`, podzbiory `latin` i `latin-ext` dla polskich znaków), bez zewnętrznych hostów.
- Canvas nie wyzwala ładowania czcionki, więc `render/fonts.ts` ładuje ją jawnie (`document.fonts.load`) w geście startowym i czeka najwyżej 1,5 s. Po przekroczeniu gra startuje z fallbackiem.
- Rozmiar napisu instrumentu dopasowuje `fitFont` (zmniejszenie proporcjonalne, gdy tekst nie mieści się w kolumnie).

## 4. Układ canvasu

Jednostka skali `u = min(w/320, h/460)` odnosi wymiary do układu odniesienia 320x460. Kolumna treści ma szerokość `col = min(w, 0.72 * h)` i jest wyśrodkowana (`colX = (w - col) / 2`). Linia trafienia leży na `0,8 * h`.

| Element | Położenie | Rozmiar |
|---|---|---|
| Naklejka `RUNDA n/m`, `PĘTLA k/loops` | `colX + 24u`, `y = 28u`, obrót +0,05 rad | wysokość 40u, szerokość z pomiaru tekstu |
| Etykieta `GRASZ` (tylko przed pierwszą nutą) | `colX + 26u`, `y = 94u` | 16u |
| Napis instrumentu | `colX + 22u`, linia bazowa `100u + 0,88 * rozmiar`, obrót -0,07 rad, czerwony cień (4u, 4u) | 78u, mniejszy przy dłuższym tekście |
| Oś środkowa | `w/2` | szerokość 4u |
| Taśma | pas `hitY ± 16u` na pełną szerokość | pasy co 40u, przesuw 30u/s |
| Krążek | `x = w/2`, `y` od 0 do `hitY` | promień `max(14, 17u)`, otwór 4u |
| Ocena / `-10` | pod taśmą, `hitY + 60u` | 26u |
| Podpowiedź `KLIKAJ. NIE PUDŁUJ.` (przed pierwszą nutą) | `hitY + 60u` | 20u |
| Wynik `n PKT` | prawy dolny róg kolumny, poza drżeniem | 20u |
| Odliczanie | środek ekranu | 30% mniejszego wymiaru |

Naklejka stoi po lewej, bo prawy górny róg zajmuje przycisk pauzy (44x44 px, `.pause-button`).

## 5. Kolejność rysowania

1. `clearRect`, potem `save()` i przesunięcie sceny o `shakeOffset * u`.
2. Warstwa tła (`drawImage`): czerń, czerwona winieta, oś, ziarno. Budowana raz na `resize` w pikselach urządzenia; ziarno z generatora `mulberry32` o stałym ziarnie, więc obraz nie zmienia się przy zmianie rozmiaru okna.
3. Nagłówek: naklejka, `GRASZ`, napis instrumentu.
4. Taśma z ewentualnym błyskiem.
5. Krążki (niezaliczone; chybione szare z alfą 0,5; po minięciu linii zanikają w 0,3 s).
6. Ocena lub podpowiedź, odliczanie.
7. `restore()`, na końcu wynik.

## 6. Efekty

| Efekt | Wyzwalacz | Parametry | `prefers-reduced-motion` |
|---|---|---|---|
| Drżenie sceny | trafienie | czas 0,28 s, amplituda 5u (perfect), 3,5u (good), 2u (ok), obwiednia kwadratowa, deterministyczne (`sin`/`cos`) | wyłączone |
| Błysk taśmy | trafienie lub puste kliknięcie | czas 0,3 s, czerwień z alfą do 0,7, najwyżej 3 na sekundę (`FLASH_GAP`) | wyłączony |
| Przesuw pasów taśmy | czas piosenki | 30u/s, stoi w pauzie i odliczaniu | wyłączony (offset 0) |
| Napis oceny | każde kliknięcie | czas 0,4 s, zanik alfy | bez zaniku do końca czasu |

Puste kliknięcie nie drży, tylko błyska i pokazuje `-10`, żeby mashowanie (R-15) nie trzęsło ekranem. Efekty działają tylko w fazie `playing`, a stan efektów jest zerowany przy zmianie rundy.

## 7. Warstwa DOM

- Przyciski: Anton, wielkie litery, złote tło, czarny obrys 3 px, twardy czerwony cień, lekki obrót (`--tilt`, co drugi przycisk w menu w przeciwną stronę). Przycisk wtórny: ciemny z białym obrysem. Stan `:active` przesuwa przycisk o 3 px, bez przejść (zgodnie z `prefers-reduced-motion`).
- Nagłówki: obrót -2 stopnie, czerwony cień. Logo (`h1.logo`) większe.
- Nakładki (`.overlay`): `rgba(10,10,10,0.9)`, `role="dialog"`, `aria-modal`, `aria-labelledby` wskazujące na `h2`.
- Fokus: biały obrys 3 px z odstępem 3 px (widoczny na złotym i ciemnym tle).
- Panel strojenia (`?debug=1`) ma własne nadpisania, żeby nie dziedziczył stylu przycisków.
- Tło strony: czerń z ziarnem jako statyczny SVG (`feTurbulence`) w `background-image`.

## 8. Dostępność

- Kontrast tekstu AA dla wszystkich par tekst/tło poza czerwienią (patrz pkt 2), sprawdzany testem.
- Błyski: najwyżej 3 na sekundę, wąski pas, wyłączone przy ograniczeniu ruchu.
- Ocena jest podawana tekstem (`PERFECT`, `GOOD`, `OK`, `-10`), nie tylko kolorem.
- Canvas ma `role="img"` i opis; pozostałe ekrany są obsługiwalne klawiaturą.
- Rozgrywka jest wizualno-dźwiękowa; pełna alternatywa dla osób niewidomych nie jest w zakresie wersji 1.

## 9. Wydajność

- W klatce: jedno `drawImage` tła, ok. 20 wielokątów taśmy, kilkanaście `fillText`, kilka łuków. Gradienty i ziarno nie są liczone w pętli.
- `?debug=1` pokazuje FPS oraz `draw (JS)` (średni i maksymalny czas `Renderer.draw`). Pomiar nie obejmuje rasteryzacji canvasu, więc służy do wykrywania regresji, a o spełnieniu NFR-02 rozstrzyga FPS na urządzeniu.
- Zasoby: dwa pliki woff2 (ok. 18 KB i 31 KB); sprawdź wpływ na budżet NFR-04 po `npm run build`.

## 10. Pliki

| Plik | Zawartość |
|---|---|
| `src/style.css` | tokeny, style DOM |
| `src/render/canvas.ts` | `Renderer` |
| `src/render/style.ts` | czyste funkcje: `shakeOffset`, `shakeEnvelope`, `fitFont`, `canFlash`, `mulberry32` |
| `src/render/stats.ts` | pomiar czasu rysowania dla ekranu debug |
| `src/render/fonts.ts` | jawne ładowanie czcionki |
| `public/licenses/Anton-OFL.txt` | licencja czcionki |
| `src/style.test.ts`, `src/render/*.test.ts` | testy kontrastu i funkcji pomocniczych |

## 11. Lista kontrolna po zmianie stylu

1. `npm test` i `npm run build` przechodzą (test kontrastu pilnuje palety).
2. Ekrany: start, menu, karta mapy, kalibracja, pauza, wyniki rundy i mapy, ranking, „O grze”, w pionie i poziomie.
3. Polskie znaki w `PĘTLA` i `NIE PUDŁUJ` na urządzeniu bez zainstalowanego Antona.
4. Ograniczenie ruchu włączone: brak drżenia, błysku i przesuwu taśmy.
5. FPS i `draw (JS)` w `?debug=1` zapisane w tabeli z `08-testing.md`.
