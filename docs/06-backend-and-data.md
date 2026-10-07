# 06. Backend i dane

Backend to pojedynczy Cloudflare Worker obsługujący `/api/*` i serwujący statyki z `./dist`. Baza: Cloudflare D1 (SQLite). Ponieważ API i statyki mają wspólny origin, konfiguracja CORS nie jest potrzebna.

Gra działa bez backendu. Awaria API wyłącza tylko ranking i kody wyzwań (NFR-05).

## 1. Schemat bazy

Stan po migracjach `migrations/0001_init.sql` i `0002_scores_without_autoincrement.sql`:

```sql
CREATE TABLE scores (
  id         INTEGER PRIMARY KEY,               -- bez AUTOINCREMENT: brak zapisu do sqlite_sequence
  chart_id   TEXT    NOT NULL,
  player     TEXT    NOT NULL,
  score      INTEGER NOT NULL CHECK (score >= 0),
  created_at INTEGER NOT NULL            -- Unix ms
);

CREATE INDEX idx_scores_chart_score ON scores (chart_id, score DESC);

CREATE TABLE challenges (
  code       TEXT    PRIMARY KEY,        -- np. 6 znaków z alfabetu bez znaków mylących
  chart_id   TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
```

Uwagi:

- Indeks `(chart_id, score DESC)` obsługuje zapytanie rankingu bez skanowania tabeli. Przy równych wynikach wyżej jest wynik zapisany wcześniej (`id ASC`). Bez `AUTOINCREMENT` nowe `id` to `max(id) + 1`; po usunięciu wiersza z największym `id` numer może zostać użyty ponownie, ale nadal jest większy od wszystkich istniejących, więc kolejność remisów się nie zmienia.
- Klucz główny tekstowy (`code`) w zwykłej tabeli SQLite tworzy dodatkowy indeks, więc zapis może liczyć się jako więcej niż jeden zapisany wiersz. Rzeczywiste liczby zawsze odczytuj z `meta.rows_written` zwracanego przez każde zapytanie D1.
- Ranking nie grupuje wyników per gracz: ten sam nick może zajmować wiele miejsc (FR-10).

## 2. Endpointy

| Metoda i ścieżka | Opis | Odpowiedź |
|---|---|---|
| `GET /api/leaderboard?chart=ID` | top 50 wyników mapy | `200` `[{ "player": "...", "score": 123 }]` |
| `POST /api/scores` | zapis wyniku | `201` `{ "ok": true }` lub `400`/`413`/`429` |
| `POST /api/challenges` | utworzenie kodu wyzwania dla mapy | `201` `{ "code": "ABC234" }` lub `400`/`404`/`429` |
| `GET /api/challenges/:code` | odczyt mapy dla kodu | `200` `{ "chart": "demo-01" }` lub `404` |

Błąd `400` ma treść `{ "error": "invalid-name" }` dla niepoprawnego lub zakazanego nicka, a `{ "error": "invalid" }` albo `{ "error": "bad request" }` dla pozostałych przypadków. Błąd bazy lub inny nieoczekiwany wyjątek daje `503` `{ "error": "unavailable" }`, żeby klient odróżnił awarię (wynik zachowany do ponowienia) od odrzucenia.

### Treść `POST /api/scores`

```json
{
  "chart": "demo-01",
  "player": "nick",
  "score": 1240,
  "hits": [[0, 12], [1, -35], [3, 61]],
  "emptyTaps": [0, 2, 1, 0, 0]
}
```

- `hits` (opcjonalne w poziomie 1, wymagane w poziomie 2): pary `[indeksNuty, deltaMs]` wyłącznie dla trafionych nut. Nuty nieobecne w `hits` są chybione. Indeks nuty to pozycja w połączonej liście nut grywalnych wszystkich rund z rozwiniętymi pętlami (`04-chart-format.md`, pkt 6).
- `emptyTaps` (wymagane razem z `hits`): liczba pustych kliknięć w każdej z 5 rund. Potrzebna do odtworzenia kary (`01-requirements.md`, pkt 4).

## 3. Walidacja i poziomy zaufania

Wynik pochodzi z klienta, więc nigdy nie jest w pełni zaufany. Wdrażaj poziomy stopniowo.

**Poziom 1: walidacja formalna (wymagany od początku)**

- `chart` istnieje na liście map (dane map są wbudowane w Worker podczas buildu). Sprawdzenie przez `Object.hasOwn`, żeby nazwy w rodzaju `constructor` czy `__proto__` nie były traktowane jak mapy.
- `player`: długość 1-20, dozwolone znaki z listy (litery, cyfry, spacja, kilka znaków specjalnych), brak słów z listy zakazanych (pkt 5).
- `score`: liczba całkowita, `0 <= score <= maxScore(chart)`.
- Rozmiar ciała żądania ograniczony do 8 KB, liczony w bajtach.
- Limit żądań na adres IP (pkt 6).

**Poziom 2: odtworzenie wyniku (zalecany)**

- Serwer przelicza punkty z `hits` i `emptyTaps` według tych samych progów i kary co klient (współdzielony moduł `engine/scoring`).
- Odrzuca wynik, jeśli przeliczona suma różni się od zgłoszonej.
- Odrzuca indeksy spoza zakresu, powtórzone indeksy oraz `deltaMs` niebędące liczbą całkowitą lub poza przedziałem +/- `CONFIG.windowsMs.ok`.
- Ocena serwera korzysta z tego samego `gradeFor` z `engine/scoring` na tych samych całkowitych `deltaMs`, które klient zapisał przy ocenie (`03-timing-and-latency.md`, pkt 4), więc wynik obu stron jest identyczny.

**Poziom 3: heurystyki nadużyć (opcjonalny)**

- Odrzucanie serii o nienaturalnie zerowej wariancji (wszystkie `deltaMs` równe).
- Minimalny czas między rozpoczęciem a zakończeniem sesji (token sesji wystawiany przy starcie mapy).
- Mechanizm ochrony przed botami (np. Cloudflare Turnstile). Dostępność w darmowym planie zweryfikuj w dokumentacji.

Decyzja o poziomie wdrożenia: `09-risks-and-decisions.md`, ADR-007.

## 4. Szkielet Workera

Implementacja: `worker/index.ts` (routing, limiter, odczyt ciała, cron), `worker/scores.ts` (poziomy 1 i 2), `worker/blocklist.ts`. Różnice względem szkicu poniżej: nick bez spacji na brzegach; `hits` i `emptyTaps` wymagane (poziom 2); mapy walidowane przy starcie Workera (ADR-016); błąd bazy daje `503`, nie `400`; kod wyzwania ponawiany do 3 razy przy kolizji; `GET /api/challenges/:code` zwraca `404` także dla mapy usuniętej z buildu.

```ts
// worker/index.ts
import charts from '../charts/index';           // zbiór map wbudowany w bundle
import { maxScore, type Chart } from '../src/engine/chart';
import { isBlockedName } from './blocklist';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  WRITE_LIMITER: RateLimit;
}

const MAX_BODY_BYTES = 8192;
const RETENTION_PER_CHART = 1000;

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });

const NAME_RE = /^[\p{L}\p{N} _\-.]{1,20}$/u;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // bez znaków mylących

function randomCode(len = 6): string {
  const buf = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(buf, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function getChart(id: unknown): Chart | undefined {
  return typeof id === 'string' && Object.hasOwn(charts, id) ? charts[id] : undefined;
}

async function readJson(req: Request): Promise<object | null> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return null;
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;
  const body: unknown = JSON.parse(raw);
  if (body === null || typeof body !== 'object') throw new Error('bad body');
  return body;
}

async function allowWrite(req: Request, env: Env): Promise<boolean> {
  const key = req.headers.get('cf-connecting-ip') ?? 'unknown';
  const { success } = await env.WRITE_LIMITER.limit({ key });
  return success;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);

    try {
      if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
        const chartId = url.searchParams.get('chart');
        if (!getChart(chartId)) return json({ error: 'unknown chart' }, { status: 404 });
        const { results } = await env.DB
          .prepare('SELECT player, score FROM scores WHERE chart_id = ? ORDER BY score DESC, id ASC LIMIT 50')
          .bind(chartId).all();
        return json(results, { headers: { 'cache-control': 'public, max-age=30' } });
      }

      if (url.pathname === '/api/scores' && req.method === 'POST') {
        if (!(await allowWrite(req, env))) return json({ error: 'too many requests' }, { status: 429 });
        const b = (await readJson(req)) as { chart: unknown; player: unknown; score: unknown } | null;
        if (!b) return json({ error: 'too large' }, { status: 413 });
        const chart = getChart(b.chart);
        const valid =
          !!chart &&
          typeof b.player === 'string' && NAME_RE.test(b.player) && !isBlockedName(b.player) &&
          Number.isInteger(b.score) && (b.score as number) >= 0 && (b.score as number) <= maxScore(chart);
        if (!valid) return json({ error: 'invalid' }, { status: 400 });

        await env.DB
          .prepare('INSERT INTO scores (chart_id, player, score, created_at) VALUES (?, ?, ?, ?)')
          .bind(b.chart, b.player, b.score, Date.now()).run();
        return json({ ok: true }, { status: 201 });
      }

      if (url.pathname === '/api/challenges' && req.method === 'POST') {
        if (!(await allowWrite(req, env))) return json({ error: 'too many requests' }, { status: 429 });
        const b = (await readJson(req)) as { chart: unknown } | null;
        if (!b) return json({ error: 'too large' }, { status: 413 });
        if (!getChart(b.chart)) return json({ error: 'unknown chart' }, { status: 404 });
        const code = randomCode();
        await env.DB
          .prepare('INSERT INTO challenges (code, chart_id, created_at) VALUES (?, ?, ?)')
          .bind(code, b.chart, Date.now()).run();
        return json({ code }, { status: 201 });
      }

      const m = url.pathname.match(/^\/api\/challenges\/([A-Z0-9]{6})$/);
      if (m && req.method === 'GET') {
        const row = await env.DB
          .prepare('SELECT chart_id FROM challenges WHERE code = ?')
          .bind(m[1]).first<{ chart_id: string }>();
        return row ? json({ chart: row.chart_id }) : json({ error: 'not found' }, { status: 404 });
      }

      return json({ error: 'not found' }, { status: 404 });
    } catch {
      return json({ error: 'bad request' }, { status: 400 });
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const stmt = env.DB.prepare(
      `DELETE FROM scores WHERE chart_id = ?1 AND id NOT IN (
         SELECT id FROM scores WHERE chart_id = ?1 ORDER BY score DESC, id ASC LIMIT ?2)`,
    );
    await env.DB.batch(Object.keys(charts).map(id => stmt.bind(id, RETENTION_PER_CHART)));
  },
};
```

Kolizja kodu wyzwania (ten sam `code` wygenerowany dwukrotnie) powinna być obsłużona ponowieniem generowania przy błędzie unikalności. Nie jest uwzględniona w szkielecie.

Zapytania używają parametrów (`bind`), nigdy konkatenacji tekstu, co chroni przed wstrzyknięciem SQL.

## 5. Moderacja nicków

### Lista zakazanych słów

Plik `worker/blocklist.ts` zawiera listę słów (PL i EN) i funkcję `isBlockedName(name)`:

1. Normalizacja: małe litery, usunięcie znaków diakrytycznych (`normalize('NFD')` i usunięcie znaków łączących), zamiana typowych podmian (`0→o`, `1→i`, `3→e`, `4→a`, `5→s`, `@→a`), usunięcie spacji i znaków `_-.`.
2. Odrzucenie, jeśli znormalizowany nick zawiera dowolne słowo z listy.

Sprawdzanie podciągów daje fałszywe trafienia (niewinne nicki zawierające zakazany fragment). Krótkie słowa z listy, np. do 3 liter, porównuj tylko z całym nickiem. Lista jest wersjonowana w repozytorium; zmiana wymaga wdrożenia Workera.

### Ręczne usuwanie wpisów

Gdy niepożądany nick przejdzie przez filtr:

```bash
npx wrangler d1 export hitline --remote --output backup-$(date +%F).sql
npx wrangler d1 execute hitline --remote --command "SELECT id, chart_id, player, score FROM scores WHERE player LIKE '%fragment%'"
npx wrangler d1 execute hitline --remote --command "DELETE FROM scores WHERE id IN (123, 456)"
```

1. Kopia bazy przed usunięciem.
2. Wyszukanie wpisów i ręczne sprawdzenie listy `id`.
3. Usunięcie po `id`, nigdy po samym wzorcu `LIKE`.
4. Dopisanie słowa do listy zakazanych, jeśli przypadek może się powtórzyć.

Zmiana jest widoczna w rankingu najpóźniej po czasie cache (`max-age=30`).

## 6. Limitowanie żądań

Zapisy (`POST /api/scores`, `POST /api/challenges`) są limitowane wbudowanym mechanizmem Rate Limiting w Workers (binding `WRITE_LIMITER`, konfiguracja w `07-deployment.md`). Wartość startowa: 10 zapisów na 60 s na adres IP. Odczyty nie są limitowane; chroni je cache.

Właściwości mechanizmu, które trzeba uwzględnić:

- licznik jest utrzymywany lokalnie w lokalizacji Cloudflare i nie jest dokładny globalnie; to ochrona przed nadużyciami, nie precyzyjny licznik;
- wywołanie limitera nie zużywa limitów D1;
- dostępność w darmowym planie, dozwolone okresy i składnię konfiguracji zweryfikuj w dokumentacji przed wdrożeniem (R-12).

Jeśli mechanizm okaże się niedostępny, zapisy działają bez limitu, a ryzyko wyczerpania budżetu zapisów D1 rośnie (R-03).

## 7. Prywatność i retencja

Przechowywane dane:

| Dane | Gdzie | Cel | Okres |
|---|---|---|---|
| nick, wynik, mapa, czas zapisu | D1, `scores` | ranking | do wypadnięcia z top 1000 mapy |
| kod wyzwania, mapa, czas utworzenia | D1, `challenges` | kody wyzwań | bezterminowo; brak danych osobowych |
| offset kalibracji, metoda zegara, ostatni niewysłany wynik, ostatni nick, najlepsze wyniki lokalne | `localStorage` przeglądarki (`hitline.*`) | działanie gry | do wyczyszczenia przez użytkownika |

- Aplikacja nie zapisuje adresów IP. Adres IP jest używany wyłącznie jako klucz limitera w pamięci Cloudflare (pkt 6).
- Nick jest publiczny; formularz wysyłki wyniku informuje o tym i odradza podawanie imienia i nazwiska.
- Usunięcie wpisu na prośbę gracza: procedura z pkt 5. Kontakt do autora podany na ekranie „O grze”.
- Retencja: codzienne zadanie (Cron Trigger, `scheduled` w pkt 4) usuwa wyniki spoza top 1000 każdej mapy. Koszt: odczyt wyników mapy raz dziennie, mieszczący się w budżecie odczytów.
- Brak analityki i ciasteczek śledzących w wersji 1.

Sekcja nie jest poradą prawną. Przed publikacją sprawdź, czy potrzebna jest polityka prywatności w osobnym dokumencie.

## 8. Budżet limitów darmowego planu

Wartości zweryfikowane 2026-10-06; sprawdź aktualne w dokumentacji Cloudflare przed wdrożeniem.

| Zasób | Limit darmowy | Konsekwencja dla projektu |
|---|---|---|
| Żądania Workera | 100 000 / dzień (konto) | po limicie API przestaje odpowiadać do 00:00 UTC |
| Limit krótkoterminowy | 1 000 żądań / minutę (konto) | ochrona przed skokami; ważne przy viralowych skokach ruchu |
| Czas CPU | 10 ms na wywołanie | proste zapytania mieszczą się; oczekiwanie na D1 nie liczy się jako CPU |
| Żądania do statyków | bez limitu i opłat | audio i JS nie obciążają budżetu żądań API |
| D1 odczyt wierszy | 5 mln / dzień | zapytanie rankingu z indeksem czyta rzędu 50 wierszy; retencja to do kilku tysięcy wierszy na mapę dziennie |
| D1 zapis wierszy | 100 000 / dzień | zapis wyniku to 2 zapisane wiersze (tabela i indeks), więc rzędu 50 000 wyników / dzień. Z `AUTOINCREMENT` było to 3 wiersze (pomiar na produkcji 2026-10-07), stąd migracja `0002` |
| D1 miejsce | 5 GB | dużo więcej, niż potrzebuje tabela wyników |

Szacunek przykładowy: jedna sesja gry to 1 żądanie `POST /api/scores` i 1-2 żądania `GET /api/leaderboard`. Przy takiej proporcji limit 100 000 żądań dziennie to rząd kilkudziesięciu tysięcy sesji dziennie. Cache rankingu po stronie przeglądarki (`max-age`) zmniejsza liczbę żądań.

Zachowanie po przekroczeniu limitów D1 wymaga weryfikacji (patrz `09-risks-and-decisions.md`, R-04). Do czasu weryfikacji nie podpinaj metody płatności do konta.

## 9. Odporność na awarię

Klient (`src/net/api.ts`) traktuje brak sieci, przekroczenie czasu (8 s) i odpowiedzi inne niż `201`, `400` i `429` jako niedostępność rankingu: wyświetla komunikat, nie blokuje gry i przechowuje ostatni wynik w `hitline.pending`. Przy `429` wynik też jest zachowywany. Zachowany wynik jest ponawiany przy każdym wejściu do menu oraz przyciskiem „Spróbuj ponownie”. Przy `400` wynik nie jest ponawiany: `invalid-name` pozwala poprawić nick, a inne odrzucenie kończy próbę.
