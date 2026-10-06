# 10. Plan rozwoju

Każdy etap kończy się spełnieniem kryteriów ukończenia. Nie przechodź do następnego, dopóki kryteria poprzedniego nie są spełnione.

## Etap 1: Silnik i kalibracja

**Zakres:** szkielet Vite + TypeScript, `AudioContext` i odblokowanie, synteza podstawowych instrumentów, pętla `requestAnimationFrame`, spadające kółka, `judge`, kalibracja, ekran debug z opóźnieniami.

**Kryteria ukończenia:**
- jedna runda testowa z wbudowaną mapą jest grywalna;
- kalibracja zapisuje i stosuje offset;
- testy jednostkowe `judge`, `clock`, `chart` przechodzą;
- pierwszy pomiar opóźnienia zapisany w `08-testing.md`.

## Etap 2: Rundy kumulatywne i punktacja

**Zakres:** format mapy (JSON) i walidacja, 5 rund z pętlami i kumulacją warstw (także `ambient`), scheduler warstw tła, punktacja z karą za puste kliknięcia, pauza z odliczaniem, ekrany wyników rundy i mapy (`11-ux.md`), decyzja w ADR-006.

**Kryteria ukończenia:**
- co najmniej jedna kompletna mapa (własna kompozycja) z 5 rundami;
- warstwy tła grają synchronicznie z grą przez całą mapę, także po pauzie i wznowieniu;
- walidacja map działa w CI.

## Etap 3: Backend i ranking

**Zakres:** Worker, D1, migracje, endpointy rankingu, klient API, obsługa awarii API, walidacja poziomu 1 (i 2, jeśli zdecydujesz), lista zakazanych nicków, limiter zapisów, zadanie retencji, pierwsze wdrożenie na Cloudflare.

**Kryteria ukończenia:**
- ranking zapisuje i odczytuje wyniki na środowisku produkcyjnym;
- zachowanie limitów D1 zweryfikowane (R-04);
- dostępność i konfiguracja Rate Limiting zweryfikowane (R-12);
- zadanie retencji działa na środowisku produkcyjnym;
- testy API przechodzą;
- gra działa przy wyłączonym API.

## Etap 4: Wyzwania z kodem

**Zakres:** tabela `challenges`, endpointy, obsługa parametru `c` w URL, udostępnianie linku.

**Kryteria ukończenia:**
- link z kodem otwiera właściwą mapę;
- nieznany kod daje czytelny komunikat.

## Etap 5: Dopracowanie

**Zakres:** strojenie dźwięków, kolejne mapy, UX mobilny, dostępność (kontrast, alternatywa dla dźwięku/wizualizacji), ekran "O grze" z licencjami, przegląd limitów (pkt 3 w `09-risks-and-decisions.md`).

**Kryteria ukończenia:**
- macierz kompatybilności wypełniona;
- `CREDITS.md` i rejestr zasobów kompletne;
- wszystkie ryzyka z rejestru mają przypisane działanie lub status.

## Backlog

- Poziom 3 ochrony rankingu (heurystyki, Turnstile).
- Pokoje wieloosobowe (analiza Durable Objects).
- Edytor map.
- Tryb treningowy z regulowanym tempem.
