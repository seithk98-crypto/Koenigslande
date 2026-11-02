# Phase F – Qualität, Sicherheit, Balance und Performance

Stand: 2026-11-02. Prüfung erfolgte lokal gegen den vorhandenen Projektstand und den lokalen Supabase-Stack. Keine gehostete oder produktive Umgebung wurde verändert.

## Prüfungsumfang und priorisierte Befunde

| Priorität | Befund | Status / Wirkung |
| --- | --- | --- |
| P2 | Der initiale Vite-JavaScript-Chunk lag bei 516,79 kB und überschritt die konfigurierte Warnschwelle. | Behoben: `MultiplayerView` wird erst beim Öffnen des Gemeinschaftsbereichs geladen. Initialer Chunk: 496,58 kB; zusätzlicher Chunk: 22,47 kB. |
| P2 | Der periodische Refresh der Gemeinschaft lud `get_player_rankings()` auch dann, wenn der Spieler den Ranglisten-Tab nicht ansah. Langsame Antworten konnten Folgeabfragen überlappen. | Behoben: Ranglisten laden nur im aktiven Tab und der jeweilige Refresh wird während einer laufenden Anfrage nicht erneut gestartet. Multiplayer-Übersichtsabrufe teilen sich eine laufende Anfrage. |
| P2 | Gehostete Rechte, Auth-Redirects und reale Produktionsdaten konnten in dieser Umgebung nicht geprüft werden. | Offen; vor Produktion Migrationen und Supabase-Projektkonfiguration separat überprüfen. |
| P2 | Es gibt keinen unabhängigen Hintergrund-Scheduler. Fällige Wirtschaft, Rekrutierung und Bewegungen werden durch authentifizierte RPC-Aufrufe nachgerechnet. | Bekannte Betriebseinschränkung: Zeitfortschritt wird gespeichert/nachgerechnet, aber ohne weitere Anfragen entstehen keine kontinuierlichen UI-Updates oder Hintergrundverarbeitung. |
| P3 | Ranglisten geben jeweils höchstens 100 Spieler, Allianzen und Dörfer zurück; Paging fehlt. | Für den aktuellen begrenzten Umfang kontrolliert, für sehr große Welten noch zu erweitern. |
| P3 | Es wurden weder ein repräsentativer Mehrspieler-Lasttest noch Browserprüfungen über mehrere Viewports ausgeführt. | Offen; Performance unter realer Last und mobile Darstellung sind damit nicht belegt. |

## Sicherheit und Datenintegrität

Die Migrationen und SQL-Tests wurden auf direkte Tabellenrechte, RLS und Ausführungsrechte der kritischen RPCs geprüft. Die lokale pgTAP-Suite bestätigt unter anderem:

- Ressourcen, Gebäude, Truppen, Warteschlangen, Bewegungen und Kampfberichte können von `authenticated` nicht direkt geschrieben beziehungsweise unberechtigt gelesen werden.
- Spieleraktionen laufen über authentifizierte RPCs mit serverseitiger Identitäts- und Eigentumsprüfung. Ressourcen, Bevölkerung, Bau-/Rekrutierungszeiten, Reisezeiten, Kampf, Verluste, Beute und Rückkehr werden serverseitig berechnet.
- Request-UUIDs, Constraints und Dorf-/Transaktionssperren schützen Wirtschafts-, Rekrutierungs- und Bewegungsaktionen vor doppelter Abbuchung beziehungsweise Konkurrenzrequests.
- Kampfauflösung und Eroberung erfolgen im Datenbankpfad; die Eroberungsgrenze wird gegen parallele Gründungen/Übernahmen serialisiert.
- Private Nachrichten sind nicht direkt lesbar; die Nachrichten-RPCs filtern nach Beteiligung. Allianzrollen und Diplomatieaktionen werden serverseitig geprüft. Realtime veröffentlicht nur inhaltsfreie, per Empfänger-RLS gefilterte Benachrichtigungen.
- Interne Kampf-, Benachrichtigungs- und Hilfsfunktionen sind nicht für Clientrollen ausführbar. `SECURITY DEFINER`-Funktionen verwenden festgelegte Suchpfade.

Die Integrationstests prüfen zusätzlich fremde Dorfzugriffe, Allianzrollen, private Nachrichten, konkurrierende Requests, Kampfberichte, Spionage und einmalige Offline-Auflösung. Es wurde in diesen lokalen Prüfungen keine konkrete offene Rechte- oder Integritätslücke festgestellt. Das ist keine unabhängige Penetrationsprüfung und bestätigt nicht die Einstellungen eines gehosteten Projekts.

## Wirtschaftliche Werte

Es wurden keine Produktions-, Kosten-, Zeit- oder Kapazitätswerte geändert. Gründe: die bestehenden Kurven sind serverseitig zentral umgesetzt und durch Phase-B-Integration abgedeckt; es liegen keine repräsentativen Verläufe für frühe und späte Spielphasen, keine Telemetrie und keine Simulation zum Vergleich möglicher Änderungen vor. Zahlenänderungen wären damit nicht belastbar.

| Mechanik | Aktuelle Regel | Prüfhinweis |
| --- | --- | --- |
| Holz, Lehm, Eisen | Stufe 1: 30 je Stunde; Folgestufen multiplizieren mit 1,2. | Serverseitige Offline-Nachrechnung; Lagergrenze wird angewendet. |
| Lager | Stufe 1: 1.000 je Ressource; Folgestufen multiplizieren mit 1,5. | Produktion oberhalb des Limits wird gekappt. |
| Bevölkerung | Bauernhof Stufe 1: 240; Folgestufen multiplizieren mit 1,2; Startbestand 100. | Rekrutierung reserviert Bevölkerung serverseitig. |
| Gebäude | Kostenfaktor 1,26 pro Ausbaustufe; Ausbau auf Stufe 2 dauert 60 Sekunden, höhere Stufen wachsen mit Faktor 1,7. | Hauptgebäude reduziert Bauzeit um 10 % pro Stufe, maximal 50 %. |
| Rekrutierung | Kosten und Grundzeiten sind je Einheit in der Einheitentabelle aufgeführt. | Hauptgebäude reduziert Ausbildungszeit um 10 % pro Stufe über 1, maximal 50 %. Kosten und freie Bevölkerung werden beim Start atomar reserviert. |

## Militärische Balance-Tabelle

Die Werte entsprechen `app_private.unit_definitions`; Angriff, Verteidigung, Kosten und Zeit wurden nicht geändert. Die Rollenbeschreibung ist eine qualitative Einordnung der vorhandenen Werte, kein Ergebnis eines simulierten Matchups.

| Einheit | Rolle | Angriff | Verteidigung Inf./Kav. | Min./Feld | Traglast | Bev. | Kosten H/L/E | Sek./Stück |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| Speerträger | günstige Kavallerieabwehr, frühe Traglast | 10 | 15 / 45 | 18 | 25 | 1 | 50 / 30 / 10 | 60 |
| Schwertkämpfer | Infanterieabwehr | 25 | 50 / 15 | 22 | 15 | 1 | 30 / 30 / 70 | 90 |
| Axtkämpfer | offensiver Infanteriekern | 40 | 10 / 5 | 18 | 10 | 1 | 60 / 30 / 40 | 100 |
| Späher | schnelle Aufklärung, keine Traglast | 0 | 10 / 5 | 9 | 0 | 2 | 50 / 50 / 20 | 120 |
| Leichte Kavallerie | schneller Angriff und hohe Beute | 130 | 30 / 40 | 10 | 80 | 4 | 125 / 100 / 250 | 180 |
| Schwere Kavallerie | teure, robuste Verteidigung | 150 | 200 / 80 | 11 | 50 | 6 | 200 / 150 / 600 | 240 |
| Rammbock | langsame Belagerungs-/Abwehreinheit | 2 | 20 / 50 | 30 | 0 | 5 | 300 / 200 / 200 | 300 |
| Katapult | langsame Fernkampf-/Belagerungseinheit | 100 | 50 / 100 | 60 | 0 | 8 | 320 / 400 / 100 | 360 |
| Adliger | sehr teure, langsame Eroberungseinheit | 30 | 50 / 50 | 35 | 0 | 80 | 1.000 / 1.000 / 1.000 | 3.600 |

Spähermechanik, Verlustgrenzen, Traglast und Beute werden serverseitig berechnet und sind durch SQL-/Integrationstests abgedeckt. Diplomatiebeziehungen verändern derzeit die Kampfregeln nicht; Bündnisunterstützung ist nicht implementiert. Ohne Spieltelemetrie wird aus dieser Bestandsaufnahme keine Behauptung abgeleitet, dass jede Einheit bereits in allen Matchups ausgewogen ist.

## Performance und Fehlerbehandlung

- Weltkarten-RPCs sind auf Radius 4–20 beschränkt, also höchstens 41 × 41 = 1.681 Rasterfelder. Die Tabelle hat einen Index auf Welt und Rasterkoordinaten. Frontend-Abfragen erfolgen nur in der Kartenansicht und werden nach 30 Sekunden aktualisiert.
- Spieler-, Allianz- und Dorfranglisten sind serverseitig auf 100 Datensätze je Kategorie begrenzt. Ranglisten werden clientseitig nur im geöffneten Tab aktualisiert.
- Gemeinschaftscode wird dynamisch geladen; der Ladezustand ist sichtbar. RPC-Fehler der Karte, Dorfansichten und Multiplayeraktionen werden angezeigt; Aktionen werden während der Anfrage gesperrt.
- Übersichten und Ranglisten verhindern überlappende Refresh-Aufrufe. Andere vorhandene Refresh-Zyklen sind an die sichtbare Ansicht gebunden und werden beim Verlassen bereinigt.
- Kein Datenbank-Lasttest, kein React-Profiler-Lauf und kein Browservergleich für mobile/desktop Viewports wurde durchgeführt.

## Teststatus

| Prüfung | Ergebnis |
| --- | --- |
| `npm test` | Bestanden: 2 Vitest-Tests. |
| `npm run test:db` | Bestanden: 102 pgTAP-Tests in fünf Dateien. |
| `npm run test:integration` | Phasen A–E bestanden: Anmeldung, Wirtschaft, Rekrutierung, parallele Requests, Kampf, Spionage, Mehrdorf, Allianzen, Diplomatie, Nachrichten, Ranglisten und RLS. |
| `npm run lint` | Bestanden, keine Ausgabe mit Fehlern. |
| `npm run build` | TypeScript und Vite erfolgreich; initialer Chunk 496,58 kB, Gemeinschafts-Chunk 22,47 kB. |
| Gehostete Datenbank / Browser / Last | Nicht durchgeführt. |

Phase F fügt keine Migration hinzu. Für eine gehostete Instanz sind die bereits vorhandenen Migrationen `202611020001` bis `202611020013` vor dem Einsatz zu prüfen und manuell anzuwenden. Der lokale Testlauf ersetzt diese Prüfung nicht.

## Produktionsreife

Der lokale Entwicklungsstand ist für die vorhandenen automatisierten Prüfungen konsistent; Build, Lint, Clienttests, Datenbanktests und A–E-Integration sind grün. Produktionsreife ist damit nicht belegt. Vor einem öffentlichen Betrieb fehlen mindestens die Prüfung und Anwendung der Migrationen in der Zielinstanz, gehostete Auth-/Redirect-/Realtime-Konfiguration, Backup-/Betriebsprüfung sowie Last- und Browser-/Mobiltests. Der fehlende Scheduler und die nicht kampfwirksame Diplomatie bleiben bekannte Produktgrenzen.
