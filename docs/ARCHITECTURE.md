# Architektur

## Phase-A-Ziel

Der Browser zeigt Spielzustand an und sendet Aktionen. PostgreSQL ist die gemeinsame Quelle für Identität, Welt, Siedlungen, Startrohstoffe und Gebäude. Authentifizierung läuft über Supabase Auth. Ohne Projektkonfiguration zeigt der Client einen Setup-Status; er erzeugt keine Demo-Sitzung und keine Ersatzwelt.

## Datenmodell

- `profiles`: UUID aus `auth.users`; der Insert-Trigger legt einen öffentlichen Spielernamen an.
- `worlds`: versionierbare gemeinsame Spielwelten.
- `world_tiles`: unveränderliches Raster mit festen Koordinaten und deterministisch gesetztem Gelände.
- `villages`: Besitzer, Name, Punkte und Weltkoordinate. Neutrale Dörfer haben keinen Besitzer.
- `village_resources`: Ressourcenbestand und Lagerkapazität pro Dorf.
- `village_buildings`: normalisierte Gebäudestufen pro Dorf.

Die erste Migration erzeugt Welt I mit 201 × 201 Feldern und neun festen neutralen Dörfern. Sie sind Datenbankzeilen und keine im Client erfundenen Kartenmarker. Das Raster ist in einem Index für begrenzte rechteckige Regionsabfragen abgelegt.

## Vertrauens- und Rechte-Grenze

RLS ist auf allen Spieltabellen aktiviert. `anon` und `authenticated` haben keine direkten Tabellenrechte auf Welt, Dörfer, Ressourcen oder Gebäude. `profiles` ist nur für den eigenen Benutzer les- und änderbar.

| Funktion | Rolle | Wirkung und Prüfung |
| --- | --- | --- |
| `handle_new_user()` | Trigger auf `auth.users` | Erzeugt ein Profil; Suchpfad ist festgelegt. |
| `get_my_starting_village()` | `authenticated` | Liefert nur ein Dorf mit `owner_id = auth.uid()`. |
| `found_starting_village(text)` | `authenticated` | Validiert Namen und Identität, serialisiert Spawn-Vergabe mit Advisory Lock und schreibt Dorf, Startbestand sowie Gebäude in einer Transaktion. Wiederholte Aufrufe liefern das bestehende Dorf. |
| `get_world_map(int,int,int)` | `authenticated` | Liefert nur eine begrenzte Rasterregion und öffentliche Dorfinformationen; Radius ist auf 4–20 begrenzt. |

Die RPCs laufen als `SECURITY DEFINER`, haben einen festen `search_path`, prüfen `auth.uid()` selbst und sind für `anon`/`public` nicht ausführbar. Das interne Payload-Hilfsverfahren ist nicht an Clientrollen freigegeben. Dorfgründung verwendet zusätzlich einen transaktionsweiten Advisory Lock; ein Unique Constraint auf Weltkoordinaten schützt die letzte Integritätsgrenze.

## Karte

Die Oberfläche lädt bei Mittelpunkt-/Zoomwechsel eine begrenzte Region per `get_world_map`. Kachelkoordinaten steuern ihre feste Position im Raster; panning ändert die Weltkoordinate, zooming ändert die serverseitige Abfragefläche. Dorfdetails stammen aus derselben Antwort. Es gibt keine Client-Generatoren für Dörfer oder Besitzer.

## Zeit und kommende Phasen

Phase B speichert den letzten Wirtschaftszeitpunkt pro Dorf und gleicht Produktion bei authentifizierten RPC-Aufrufen serverseitig ab. Die Rohstoffberechnung behält Bruchteile bei, beachtet das Lagerlimit und verarbeitet Bauabschlüsse chronologisch, damit Gebäudeeffekte erst ab ihrem tatsächlichen Fertigstellungszeitpunkt wirken. `construction_queue` speichert serverberechnete `started_at`-/`completes_at`-Zeitpunkte; der Upgrade-RPC sperrt das Dorf, zieht Kosten atomar ab und erkennt Wiederholungen anhand eines Request-UUIDs. Details und manuelle Migration sind in [PHASE_B_ECONOMY.md](./PHASE_B_ECONOMY.md) beschrieben.

Phase C hält Balancingdaten in `app_private.unit_definitions`, Bestände in `village_troops` und Aufträge in `recruitment_queue`. Ausbildungszeiten und Einrichtungsvoraussetzungen werden serverseitig berechnet; Rohstoffe und Bevölkerung werden beim Start unter Sperre des Dorfs reserviert. Jede Queue-Zeile bleibt dorfgebunden. `get_village_state(uuid)` prüft den Besitz und rechnet fällige Ausbildungen offline nach. `release_troops(uuid,text,int)` gibt Bevölkerung für aufgelöste Einheiten frei. Details sind in [PHASE_C_MILITARY.md](./PHASE_C_MILITARY.md) festgehalten.

Phase D speichert Bewegungen in `troop_movements` und betrachtergetrennte Kampf-/Spähberichte in `combat_reports`. `send_troop_movement(uuid,uuid,text,jsonb,uuid)` prüft Besitz, Truppenbestand, Ziel und Bewegungstyp serverseitig, berechnet Reisezeiten und reserviert Truppen in einer Transaktion. `get_movement_overview()` verarbeitet fällige Bewegungen und gibt nur berechtigte Berichte zurück. Kampf, Verluste, Bevölkerungsanpassung, Beute und Rückkehr sind serverseitig und einmalig; Details und die dokumentierte Formel stehen in [PHASE_D_COMBAT.md](./PHASE_D_COMBAT.md).

Phase E ergänzt eindeutige öffentliche Profile, Mehrdorf-Verwaltung, Allianzen, Rollen, Einladungen, Diplomatie, private und Allianz-Nachrichten, Benachrichtigungen und Ranglisten. Soziale Daten werden über geschützte RPCs gelesen/geschrieben; nur RLS-gefilterte, inhaltsfreie Benachrichtigungsereignisse sind für Realtime-SELECT freigegeben. `found_additional_village(uuid,text)` und der kampfgebundene Besitzerwechsel beachten die zentralen Expansionseinstellungen und serialisieren die Dorfobergrenze. Mehr Details und die Migrationen `202611020008` bis `202611020013`: [PHASE_E_MULTIPLAYER.md](./PHASE_E_MULTIPLAYER.md).

Der Browser zeigt Server-Countdowns und fragt den Dorfstand regelmäßig ab; er autorisiert weder Produktion, Abbuchung, Fertigstellung noch Kampfergebnisse. Ein separater Scheduler für korrekten Offline-Fortschritt ist nicht erforderlich, da verstrichene Zeit beim nächsten RPC nachgerechnet wird. Eine kontinuierliche Aktualisierung ohne aktive Spieleranfragen ist nicht enthalten.

Die Gemeinschaftsansicht wird erst beim Öffnen als eigener JavaScript-Chunk geladen. Ihre Übersicht wird gegen überlappende Refreshes geschützt; Ranglisten werden nur im aktiven Ranglisten-Tab abgefragt und sind serverseitig auf jeweils 100 Einträge begrenzt. Es gibt noch keine Seitennavigation für größere Ranglisten. Details zu Prüfungen, bekannten Grenzen und Verifikation sind in [PHASE_F_QUALITY.md](./PHASE_F_QUALITY.md) dokumentiert.

## Lokale und produktive Umgebungen

`supabase/config.toml` und `supabase/migrations` ermöglichen reproduzierbare lokale Entwicklung. Im Browser wird `/supabase` same-origin über den Vite-Devserver auf den lokalen Supabase-API-Port weitergeleitet; dadurch hängt Anmeldung nicht von einem separat freigegebenen Codespace-Port ab. Die Migration, pgTAP-Berechtigungstests und ein Auth-/RPC-Integrationstest liefen gegen den lokalen Supabase-Stack. Eine gehostete Supabase-Instanz, E-Mail-Zustellung und produktive Betriebs-/Backup-Konfiguration sind noch nicht validiert.