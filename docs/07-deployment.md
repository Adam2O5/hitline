# 07. Wdrożenie

## 1. Narzędzia

- Node.js (aktualna wersja LTS), npm
- Vite, TypeScript, Vitest
- Wrangler (CLI Cloudflare)
- Konto Cloudflare (plan darmowy)

## 2. Konfiguracja Workera

`wrangler.toml`:

```toml
name = "hitline-game"
main = "worker/index.ts"
compatibility_date = "2026-10-01"

[assets]
directory = "./dist"
binding = "ASSETS"
run_worker_first = ["/api/*"]

[[d1_databases]]
binding = "DB"
database_name = "hitline"
database_id = "<ID zwrócone przez wrangler d1 create>"
migrations_dir = "migrations"

[[ratelimits]]
name = "WRITE_LIMITER"
namespace_id = "1001"
simple = { limit = 10, period = 60 }

[triggers]
crons = ["0 3 * * *"]
```

Szczegóły składni `[assets]`, `[[ratelimits]]` i kolejności obsługi żądań zmieniają się między wersjami Wranglera. Traktuj powyższy plik jako punkt wyjścia i zweryfikuj z bieżącą dokumentacją. Nazwy Workera i bazy D1 zapisuj małymi literami.

`run_worker_first = ["/api/*"]` kieruje żądania API zawsze do Workera, a pozostałe ścieżki najpierw do statyków. Format tablicy wzorców sprawdź w dokumentacji swojej wersji Wranglera; starsze wersje przyjmują tylko wartość logiczną. Nie włączaj `not_found_handling = "single-page-application"` bez sprawdzenia w `wrangler dev`, że żądania `/api/*` nadal trafiają do Workera. `namespace_id` limitera to dowolny identyfikator liczbowy unikalny w obrębie konta. Cron uruchamia codzienną retencję wyników (`06-backend-and-data.md`, pkt 7) o 03:00 UTC.

## 3. Skrypty `package.json`

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "dev:api": "wrangler dev",
    "test": "vitest run",
    "validate:charts": "tsx scripts/validate-charts.ts",
    "db:migrate:local": "wrangler d1 migrations apply hitline --local",
    "db:migrate:remote": "wrangler d1 migrations apply hitline --remote",
    "deploy": "npm run build && wrangler deploy"
  }
}
```

## 4. Pierwsze uruchomienie

```bash
npm install
npx wrangler login
npx wrangler d1 create hitline                 # skopiuj database_id do wrangler.toml
npm run db:migrate:local
npm run dev:api                              # lokalnie: Worker + lokalna D1
npm run db:migrate:remote                    # po sprawdzeniu lokalnie
npm run deploy
```

## 5. Środowiska

| Środowisko | Cel | Baza |
|---|---|---|
| Lokalne | rozwój i testy | lokalna D1 (`--local`) |
| Podgląd (preview) | weryfikacja zmian przed produkcją | osobna baza D1 lub przełącznik środowiska |
| Produkcja | publiczna wersja | produkcyjna D1 |

Mechanizm podglądu (osobny Worker z własną bazą albo funkcje wersji/podglądów Cloudflare) wybierz po przeczytaniu aktualnej dokumentacji Cloudflare. Nie współdziel bazy produkcyjnej ze środowiskiem testowym.

## 6. Migracje

- Każda zmiana schematu to nowy plik w `migrations/` (`0002_*.sql`), nigdy edycja istniejącego.
- Migracja jest najpierw stosowana lokalnie, potem zdalnie.
- Kopię bazy produkcyjnej (eksport) wykonaj przed migracją niszczącą dane.

## 7. CI/CD (GitHub Actions)

`.github/workflows/deploy.yml`:

```yaml
name: deploy
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 'lts/*', cache: npm }
      - run: npm ci
      - run: npm run validate:charts
      - run: npm test
      - run: npm run build

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 'lts/*', cache: npm }
      - run: npm ci
      - run: npm run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy
```

Sekrety `CLOUDFLARE_API_TOKEN` i `CLOUDFLARE_ACCOUNT_ID` ustaw w ustawieniach repozytorium. Token powinien mieć minimalne uprawnienia potrzebne do wdrożenia Workera i D1. Wersje akcji (`@v3`, `@v4`) sprawdź przy konfiguracji.

## 8. Cache i nagłówki

| Zasób | Strategia |
|---|---|
| `index.html` | krótki cache lub rewalidacja, by nowe wdrożenia były widoczne od razu |
| `assets/*` (JS, CSS z hashem) | `Cache-Control: public, max-age=31536000, immutable` |
| pliki audio z hashem w nazwie | jak wyżej |
| `GET /api/leaderboard` | `public, max-age=30` |

Nagłówki dla statyków można ustawić plikiem `_headers` w `public/` (jeśli wspiera to Twoja konfiguracja assets; zweryfikuj w dokumentacji) lub w Workerze.

Preload krytycznych zasobów w `index.html` skraca czas do pierwszej interakcji. Zasoby audio dekoduj dopiero po geście użytkownika.

## 9. Domena

Adres `*.workers.dev` wystarcza na start. Własna domena jest potrzebna, jeśli chcesz użyć niektórych funkcji (np. cache edge przez Cache API lub reguł limitowania); zweryfikuj wymagania w dokumentacji.

## 10. Kontrola kosztów

- Nie podpinaj karty do konta, dopóki nie zweryfikujesz zachowania limitów (R-04).
- Monitoruj zużycie w panelu Cloudflare (Workers, D1) po pierwszym tygodniu ruchu.
- Zapisuj `meta.rows_read` i `meta.rows_written` dla kluczowych zapytań podczas testów, by znać rzeczywisty koszt zapytań.
