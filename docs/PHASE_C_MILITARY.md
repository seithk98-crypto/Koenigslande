# Phase C – Militär und Rekrutierung

## SQL und Migration

`supabase/migrations/202611020005_phase_c_military.sql` ergänzt ein zentrales, nur serverseitig zugängliches Einheiten-Balancing in `app_private.unit_definitions`, einen dorfbezogenen Bestand (`village_troops`) und eine Ausbildungswarteschlange (`recruitment_queue`). Die Migration fügt Tabellen und Funktionen hinzu, löscht keine vorhandenen Spieler-, Dorf- oder Wirtschaftsdaten und wird nicht automatisch beim App-Start ausgeführt.

Für lokale Entwicklung:

```bash
npx supabase db push --local
npm run test:db
npm run test:integration
```

In gehosteten Umgebungen muss die Migration separat geprüft und ausdrücklich angewendet werden. Eine produktive oder fremde Datenbank wurde nicht angesprochen.

## Zentrale Einheitenwerte

Die Werte sind in der Migration zentral als Datensätze konfiguriert und können für Balancing angepasst werden:

| Einheit | Angriff | Verteidigung Inf./Kav. | Min./Feld | Traglast | Bev. | Holz/Lehm/Eisen | Sek./Stück |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| Speerträger | 10 | 15 / 45 | 18 | 25 | 1 | 50 / 30 / 10 | 60 |
| Schwertkämpfer | 25 | 50 / 15 | 22 | 15 | 1 | 30 / 30 / 70 | 90 |
| Axtkämpfer | 40 | 10 / 5 | 18 | 10 | 1 | 60 / 30 / 40 | 100 |
| Späher | 0 | 10 / 5 | 9 | 0 | 2 | 50 / 50 / 20 | 120 |
| Leichte Kavallerie | 130 | 30 / 40 | 10 | 80 | 4 | 125 / 100 / 250 | 180 |
| Schwere Kavallerie | 150 | 200 / 80 | 11 | 50 | 6 | 200 / 150 / 600 | 240 |
| Rammbock | 2 | 20 / 50 | 30 | 0 | 5 | 300 / 200 / 200 | 300 |
| Katapult | 100 | 50 / 100 | 60 | 0 | 8 | 320 / 400 / 100 | 360 |

Einheiten benötigen passende Gebäudestufen: Kaserne für Infanterie, Stall für Späher/Kavallerie, Werkstatt für Belagerung. Die Schmiede schaltet fortgeschrittene Einheitentypen frei. Das Hauptgebäude reduziert die Rekrutierungsdauer um 10 % je Stufe über 1, maximal um 50 %.

## Serverregeln und RPCs

- `start_recruitment(village_id, unit_code, quantity, request_id)` prüft Anmeldung und Dorfbesitz, Stufenvoraussetzungen, Bestand und freie Bevölkerung. Menge ist auf 1–10.000 beschränkt. Rohstoffe und Bevölkerung werden atomar reserviert; Request-UUIDs sind je Dorf eindeutig. Die Anfragen pro Dorf werden serialisiert, damit verschiedene parallele Aufträge nicht denselben Bestand ausgeben.
- Für jede Ausbildungsstätte läuft eine eigene serielle Warteschlange. Die tatsächliche Endzeit und Hauptgebäude-Auswirkung berechnet PostgreSQL.
- `get_village_state(village_id)` verarbeitet fällige Aufträge offline und liefert Bestand, Statistiken, Freischaltungen sowie verbleibende Zeit. `get_my_starting_village()` liefert dieselben Militärdaten zusätzlich zum bestehenden Startdorf-Payload.
- Fertige Aufträge werden beim nächsten authentifizierten RPC gutgeschrieben und bleiben als abgeschlossene Zeilen für Idempotenz erhalten. Rekrutierte Einheiten bleiben an ihre Dorf-ID gebunden.
- `release_troops(village_id, unit_code, quantity)` löst vorhandene Einheiten auf und gibt deren Bevölkerungsplätze frei. Eine serverseitige Kampf-/Verlustauflösung ist Phase D.
- Tabellen und private Balancingdaten haben RLS und keine direkten Clientrechte. Alle Aktionen laufen über authentifizierte `SECURITY DEFINER`-RPCs mit Eigentumsprüfung.

Der Browser zeigt Kosten und Zeit als Vorschau. Die verbindliche Prüfung, Abrechnung, Freischaltung und Fertigstellung liegt ausschließlich in PostgreSQL.
