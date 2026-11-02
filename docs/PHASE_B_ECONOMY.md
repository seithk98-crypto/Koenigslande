# Phase B – Wirtschaftssystem

## Änderungen an Supabase

Die SQL-Änderungen liegen als getrennte, additive Migrationen vor:

- `supabase/migrations/202611020002_phase_b_economy.sql` ergänzt Bevölkerungs- und Produktionszeitdaten, schützt Bestände beim Upgrade, definiert Bauaufträge und serverseitige Wirtschafts-RPCs.
- `supabase/migrations/202611020003_phase_b_population_default.sql` setzt den Anfangsbestand auf 100 Einwohner und korrigiert vorhandene Nullwerte.
- `supabase/migrations/202611020004_phase_b_upgrade_cost_curve.sql` stellt sicher, dass der erste Ausbau die Grundkosten verwendet.

Die Migrationen behalten vorhandene Spieler, Dörfer und Bestände bei; bestehende Rohstoffbestände werden bei der Schemaerweiterung lediglich auf das jeweilige Speicherlimit begrenzt. Es wird keine Migration beim Start der Anwendung ausgeführt. Eine gehostete oder produktive Supabase-Datenbank muss nach Prüfung der SQL-Dateien ausdrücklich und separat migriert werden. `db reset` ist dafür nicht geeignet.

## Serverregeln

- Jeder Dorfbestand enthält Holz, Lehm, Eisen und den vorhandenen Proviant sowie eine eigene Lagerkapazität. Die Kapazität gilt je Ressource.
- Holzfäller, Lehmgrube und Eisenmine produzieren auf Stufe 1 jeweils 30 Einheiten pro Stunde; jede weitere Stufe erhöht die Rate mit Faktor 1,2. Bruchteile werden gespeichert, damit häufige Aktualisierungen keine Produktion verlieren.
- Speicher-Stufe 1 fasst 1.000 Einheiten je Ressource; jede weitere Stufe multipliziert das Limit mit 1,5. Produktion wird serverseitig bei diesem Limit gekappt.
- Bauernhof-Stufe 1 bietet Platz für 240 Einwohner; jede weitere Stufe erhöht die Kapazität mit Faktor 1,2. Ein neues Dorf startet mit 100 Einwohnern.
- Baukosten sind je Gebäudetyp festgelegt und wachsen ab dem zweiten Ausbau mit Faktor 1,26 pro Stufe. Die erste Ausbaustufe nutzt die Grundkosten. Ein Ausbau auf Stufe 2 dauert 60 Sekunden; höhere Stufen wachsen mit Faktor 1,7. Hauptgebäude-Stufen beschleunigen Bauzeiten um 10 % je Stufe, höchstens bis zur halben Dauer.
- Alle 12 vorhandenen Gebäude können bis Stufe 20 ausgebaut werden. Die Ressourcenkosten werden beim Einreihen atomar abgezogen; jede Anfrage hat einen pro Dorf eindeutigen UUID-Schlüssel, damit wiederholte oder parallel wiederholte Requests nicht doppelt abbuchen.
- Dorfabrufe und Bauanfragen gleichen Rohstoffe anhand der gespeicherten Serverzeit ab. Überschrittene Fertigstellungszeitpunkte werden chronologisch verarbeitet; Produktionsraten ändern sich exakt ab dem Fertigstellungszeitpunkt.

## RPC-Oberfläche

- `get_my_starting_village()` rechnet Offline-Produktion nach, übernimmt fällige Aufträge und liefert Bestand, Stufen, Stundenraten, Ausbauangebote und aktive Aufträge zurück.
- `start_building_upgrade(text, uuid)` prüft Identität, Stufengrenze und Bestand, berechnet Preis und Dauer auf dem Server und fügt den Auftrag transaktional hinzu.

Spielclients haben keine direkten Tabellen-Schreibrechte. Die Oberfläche zeigt den zurückgegebenen Serverzustand; der Countdown ist nur Darstellung und entscheidet nicht über Produktion oder Fertigstellung. Die Anwendung fragt den Server alle 15 Sekunden ab. Offline-Fortschritt und Bauabschluss werden bei der nächsten authentifizierten RPC-Anfrage nachgerechnet; ein separater Scheduler für eine laufende Darstellung ohne aktive Anfragen ist nicht Teil dieser Phase.

## Lokale Prüfung

```bash
npx supabase db push --local
npm run test:db
npm run test:integration
```

Diese Befehle wurden gegen den lokalen Supabase-Stack verwendet. Es wurde keine gehostete Datenbank verknüpft oder verändert.
