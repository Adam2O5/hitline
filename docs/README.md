# Hitline (nazwa robocza)

Webowa gra rytmiczna z naciskiem na niskie opóźnienia. Gracz klika jeden przycisk w momencie, gdy spadające kółko dociera do linii trafienia. Każde trafienie odtwarza dźwięk instrumentu (kick, snare, clap, hi-hat, 808, string), a w kolejnych rundach warstwy łączą się w pełny beat.

Stack: Vite + TypeScript, Canvas 2D, Web Audio API, Cloudflare Workers (statyki + API), Cloudflare D1 (SQLite).

## Status dokumentacji

Dokumentacja opisuje stan zaplanowany. Limity darmowych planów Cloudflare zostały sprawdzone 2026-10-06 i mogą się zmienić. Przed wdrożeniem zweryfikuj je w oficjalnej dokumentacji (patrz `docs/09-risks-and-decisions.md`).

## Spis dokumentów

| Plik | Zawartość |
|---|---|
| `docs/01-requirements.md` | wymagania funkcjonalne i niefunkcjonalne, budżet opóźnień |
| `docs/02-architecture.md` | moduły, przepływ danych, zasada jednego zegara |
| `docs/03-timing-and-latency.md` | synchronizacja, ocena trafień, kalibracja, scheduler audio |
| `docs/04-chart-format.md` | format mapy nut (JSON), walidacja, kumulacja warstw |
| `docs/05-audio-assets.md` | synteza instrumentów, rejestr zasobów, licencje |
| `docs/06-backend-and-data.md` | API, schemat D1, walidacja wyników, moderacja, limitowanie, prywatność, budżet limitów |
| `docs/07-deployment.md` | wrangler, skrypty, CI/CD, cache |
| `docs/08-testing.md` | testy jednostkowe, pomiar opóźnień, macierz urządzeń |
| `docs/09-risks-and-decisions.md` | rejestr ryzyk i zapisy decyzji architektonicznych (ADR) |
| `docs/10-roadmap.md` | etapy i kryteria ukończenia |
| `docs/11-ux.md` | ekrany, przejścia między nimi, komunikaty |

Zalecana kolejność czytania: 02, 03, 04, 11, potem reszta.

## Szybki start (lokalnie)

```bash
npm install
npm run dev            # Vite, gra bez backendu
npm run dev:api        # wrangler dev, Worker + lokalna D1
npm test               # vitest
npm run build          # produkcyjny build do ./dist
```

Skrypty są zdefiniowane w `package.json` (patrz `docs/07-deployment.md`).

## Struktura repozytorium

```
.
├── README.md
├── CREDITS.md         # atrybucje zasobów (docs/05-audio-assets.md)
├── .github/
│   └── workflows/
│       └── deploy.yml # CI/CD (docs/07-deployment.md)
├── docs/
│   └── assets-register.csv
├── src/
│   ├── engine/        # config, clock, judge, scoring, session, chart
│   ├── audio/         # AudioContext, synteza, scheduler
│   ├── render/        # Canvas, animacja kółek
│   ├── net/           # klient API
│   ├── ui/            # ekrany, kalibracja
│   └── main.ts
├── worker/
│   ├── index.ts       # API na Cloudflare Workers, zadanie retencji
│   └── blocklist.ts   # lista zakazanych słów w nickach
├── migrations/        # SQL dla D1
├── charts/
│   ├── index.ts       # zbiór map importowany przez klienta i Worker
│   └── *.json         # mapy nut
├── scripts/
│   └── validate-charts.ts
├── public/
├── package.json
├── wrangler.toml
└── vite.config.ts
```

## Licencje

Kod: do uzupełnienia przez autora. Dźwięki i mapy nut: wyłącznie własna synteza, własne kompozycje lub zasoby o jawnej licencji (patrz `docs/05-audio-assets.md`). Projekt nie zawiera fragmentów istniejących nagrań.
