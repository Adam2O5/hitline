# Credits

## Dźwięk

Wszystkie instrumenty są syntezowane w Web Audio API (`src/audio/synth.ts`). Projekt nie zawiera plików audio, próbek ani nagrań.

## Mapy

Mapy w `charts/` (`easy-01`, `demo-01`, `mid-01`, `hard-01`) są autorskimi kompozycjami przygotowanymi dla projektu. Nie zawierają melodii ani linii basu istniejących utworów.

## Czcionki

| Czcionka | Wersja pakietu | Licencja | Prawa autorskie | Gdzie |
|---|---|---|---|---|
| [Anton](https://github.com/googlefonts/AntonFont) (Regular 400, podzbiory latin i latin-ext) | `@fontsource/anton` 5.3.0 | SIL Open Font License 1.1 | Copyright 2020 The Anton Project Authors | pakiet przeglądarki (pliki woff2 w `dist/assets`); interfejs i canvas |

Tekst licencji dołączony do wdrożenia: `public/licenses/Anton-OFL.txt` (dostępny pod `/licenses/Anton-OFL.txt` i linkowany z ekranu „O grze”). Pliki zewnętrzne są wpisane w `docs/assets-register.csv`.

## Biblioteki w kodzie wdrażanym

| Biblioteka | Wersja | Licencja | Gdzie | Autor |
|---|---|---|---|---|
| [Zod](https://github.com/colinhacks/zod) | 4.6.5 | MIT | Worker (walidacja map); poza paczką przeglądarki | Colin McDonnell |

Pakiet przeglądarki nie zawiera bibliotek JavaScript; zawiera wyłącznie pliki czcionki Anton (sekcja wyżej). Narzędzia deweloperskie (Vite, TypeScript, Vitest, tsx, Wrangler) nie trafiają do kodu wdrażanego.

## Licencja projektu

Do uzupełnienia przez autora (`src/about.ts`, pole `codeLicense`).
