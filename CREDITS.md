# Credits

## Dźwięk

Wszystkie instrumenty są syntezowane w Web Audio API (`src/audio/synth.ts`). Projekt nie zawiera plików audio, próbek ani nagrań. Rejestr zasobów zewnętrznych: `docs/assets-register.csv` (obecnie pusty).

## Mapy

Mapy w `charts/` (`easy-01`, `demo-01`, `mid-01`, `hard-01`) są autorskimi kompozycjami przygotowanymi dla projektu. Nie zawierają melodii ani linii basu istniejących utworów.

## Biblioteki w kodzie wdrażanym

| Biblioteka | Wersja | Licencja | Gdzie | Autor |
|---|---|---|---|---|
| [Zod](https://github.com/colinhacks/zod) | 4.6.5 | MIT | Worker (walidacja map); poza paczką przeglądarki | Colin McDonnell |

Pakiet przeglądarki nie zawiera bibliotek zewnętrznych. Narzędzia deweloperskie (Vite, TypeScript, Vitest, tsx, Wrangler) nie trafiają do kodu wdrażanego.

## Licencja projektu

Do uzupełnienia przez autora (`src/about.ts`, pole `codeLicense`).
