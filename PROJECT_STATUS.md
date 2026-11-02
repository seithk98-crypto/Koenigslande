# Königslande – Projektstatus

Stand: 02.11.2026  
Repository: [seithk98-crypto/Koenigslande](https://github.com/seithk98-crypto/Koenigslande)  
Arbeitsbranch: `main`

Diese Datei ist die zentrale Übergabe- und Orientierungshilfe für die weitere Entwicklung. Sie dokumentiert den zuletzt geprüften GitHub-Stand und die im Chat festgehaltenen Supabase-Erkenntnisse. Datenbankzustände können sich unabhängig vom GitHub-Repository ändern.

---

## 1. Projektüberblick

Königslande ist ein browserbasiertes Mittelalter-Aufbaustrategiespiel mit Dorfentwicklung, Rohstoffproduktion, Gebäuden, Bevölkerung, Rekrutierung und ersten Truppenbewegungen.

**Technik**
- React 19
- TypeScript
- Vite
- Supabase Auth, PostgreSQL und RPC-Funktionen
- npm

Frontend-Verzeichnis: `client/`

Lokale Befehle im Verzeichnis `client`:
- `npm install`
- `npm run dev`
- `npm run build` (TypeScript-Prüfung und Vite-Build)
- `npm run lint`

## 2. Zuletzt im Repository vorhandener Stand

Der zuletzt geprüfte Branch ist `main`. Der Stand enthält unter anderem:

- `client/src/App.tsx` – zentrale Spielansicht und Aufrufe der Supabase-RPCs
- `client/src/WorldMap.tsx` und `WorldMap.css` – aktuelle Weltkartenansicht
- `client/src/AuthGate.tsx` – Authentifizierungsbereich
- `client/src/StartingVillageGate.tsx` – Prüfung/Weiterleitung rund um das Startdorf
- `client/src/supabase.ts` – Supabase-Client
- SQL-Dateien im Repository-Wurzelverzeichnis:
  - `attack_targets_rpc.sql`
  - `start_attack_rpc.sql`
  - `combat_foundation_migration.sql`
  - `unit_roster_migration.sql`

Hinweis: Im zuletzt gelesenen Repository-Baum war kein Verzeichnis `supabase/migrations` vorhanden. SQL-Dateien liegen derzeit im Repository-Wurzelverzeichnis. Vor dem Einführen einer Migrationsstruktur muss geprüft werden, wie der Nutzer lokal arbeitet.

## 3. Was bereits vorhanden ist

### Anmeldung und Dorf
- Registrierung/Anmeldung über Supabase ist im Projekt angelegt.
- Das Frontend lädt den eigenen Dorfzustand über `get_my_village_state`.
- Rohstoffe, Produktionsraten, Lagerkapazität und Gebäude werden angezeigt.
- Gebäudeausbau wird über `start_building_upgrade` gestartet.
- Die Oberfläche aktualisiert den Dorfzustand regelmäßig.

### Bevölkerung und Rekrutierung
- Bevölkerungszustand wird über `get_my_population_state` geladen.
- Truppen und Ausbildungswarteschlange werden über `get_my_military_state` geladen.
- Rekrutierung wird über `start_recruitment` gestartet.
- Im Frontend gibt es eine sekündliche Anzeigeaktualisierung für Timer.

### Angriffe und Truppenbewegungen – Grundlagen
- Das Frontend ruft `get_attack_targets` auf, um mögliche Ziele zu laden.
- Angriffe werden über `start_attack` angefordert.
- SQL-Grundlagen für Truppenbewegungen und Kampfberichte sind vorhanden.
- Das ist noch kein vollständiges Kampfsystem: automatische Ankunftsverarbeitung, Kampfauflösung, Berichte und Rückkehr müssen gesondert geprüft/entwickelt werden.

## 4. Weltkarte – aktueller Zustand und nächstes Entwicklungsziel

Dateien:
- `client/src/WorldMap.tsx`
- `client/src/WorldMap.css`

**Aktueller Frontend-Zustand (direkt im Code geprüft):**
- Die Weltkarte hat eine mittelalterliche Hex-/Sechseck-Optik mit Terrain-Dekoration.
- Das eigene Dorf wird dargestellt.
- Acht Barbarendörfer sind derzeit als feste Testdaten im Frontend hinterlegt.
- Die Karte ist momentan ein festes 9×9-Raster relativ zum eigenen Dorf.
- Ausgewählte Testdörfer zeigen statische Beispielinformationen.
- Es gibt noch keine dynamische Kartenabfrage aus `WorldMap.tsx`.

**Nächstes Entwicklungsziel: dynamische Weltkarte**
1. Tatsächliche Dörfer aus Supabase laden.
2. Eigene Dörfer, fremde Spielerdörfer und Barbarendörfer korrekt unterscheiden.
3. Echte X-/Y-Koordinaten auf der Karte darstellen.
4. Beim Anklicken eines Dorfes echte, für den aktuellen Spieler freigegebene Informationen anzeigen.
5. Die bestehende mittelalterliche Kartenoptik beibehalten.
6. Lade-, Leer- und Fehlerzustände ergänzen.
7. Keine sensiblen Ressourcen-, Truppen- oder Kontodaten anderer Spieler offenlegen.

**Wichtige Datenbank-Abhängigkeit:**
- In der Supabase-Datenbank wurde im bisherigen Arbeitsverlauf eine Funktion `get_map_area` gefunden/erwähnt.
- Ihre aktuelle Signatur, Implementierung und JSON-Rückgabe sind in diesem Repository-Stand nicht dokumentiert.
- Vor der Frontend-Anbindung muss Claude die tatsächliche Funktion in Supabase prüfen bzw. der vorhandene SQL-Code bereitgestellt werden. Keine Parameter oder Rückgabefelder erfinden.
- `get_attack_targets()` ist im Repository dokumentiert. Sie gibt für die eigene Welt fremde Dörfer mit `id`, `name`, `x` und `y` zurück. Das ist eine Zielauswahl für Angriffe und nicht automatisch eine vollständige Karten-API.

## 5. Bekannte Datenbankfunktionen

Im bisherigen Supabase-Check wurden folgende öffentliche Funktionen festgestellt. Die Beschreibungen geben den bisher bekannten Zweck wieder; vor Änderungen ist die aktuell installierte Definition in Supabase maßgeblich.

| Funktion | Bekannter Zweck |
|---|---|
| `get_my_village_state()` | Zustand des eigenen Dorfes laden |
| `get_my_population_state()` | Bevölkerungswerte laden |
| `get_my_military_state()` | Truppen und Rekrutierungswarteschlange laden; verarbeitet Rekrutierung |
| `collect_my_resources()` | Rohstoffe/Produktion berechnen und einsammeln |
| `process_my_village()` | fällige Gebäudeaufträge verarbeiten |
| `process_my_recruitment()` | fällige Rekrutierungen verarbeiten |
| `start_building_upgrade(text)` | Gebäudeausbau starten |
| `start_recruitment(text, integer)` | Rekrutierung starten |
| `get_attack_targets()` | fremde Dörfer der eigenen Welt als Angriffsziele liefern |
| `start_attack(uuid, uuid, jsonb)` | Truppenbewegung/Angriff starten |
| `get_map_area` | wurde in Supabase erwähnt; Signatur und Verhalten noch zu verifizieren |
| `create_starting_village()` | Startdorf anlegen |
| `handle_new_user()` | im bisherigen Check als Funktion vorhanden; Trigger-/Auth-Kontext prüfen |
| `initialize_village_buildings()` | Initialisierung von Gebäuden; Triggerkontext prüfen |
| `initialize_village_units()` | Initialisierung von Einheiten; Triggerkontext prüfen |
| `check_building_population()` | Gebäude-/Bevölkerungsprüfung; Triggerkontext prüfen |
| `check_building_requirements()` | Bauvoraussetzungen prüfen |

## 6. Sicherheits- und Datenbankbefunde vom 02.11.2026

Diese Befunde stammen aus lesenden Abfragen in Supabase während der gemeinsamen Sitzung. Es wurde dabei keine Migration ausgeführt.

- Für die 15 damals geprüften Tabellen war Row Level Security aktiviert.
- Die gelesenen RLS-Policies waren überwiegend SELECT-Policies für `authenticated`; eigene Spielerdaten wurden über `auth.uid()` und Besitzbeziehungen eingeschränkt.
- Es wurden keine INSERT-/UPDATE-/DELETE-Policies in der ausgegebenen Policy-Liste sichtbar.
- Die Tabellenrechte zeigten unerwartete direkte Rechte für `anon` und `authenticated`, insbesondere Schreib-/TRUNCATE-/TRIGGER-/REFERENCES-Rechte auf `unit_types` sowie weitreichende Rechte auf einigen anderen Tabellen.
- Mehrere SECURITY DEFINER-Funktionen waren laut `has_function_privilege` auch für `anon` ausführbar. Das kann durch PUBLIC-Rechte entstehen; die Funktionsrechte müssen gezielt gehärtet werden.
- `start_attack(uuid, uuid, jsonb)` war in diesem Check bereits nicht für `anon` ausführbar.

**Wichtig:** Diese Befunde sind noch nicht korrigiert. Die zuvor vorbereitete Datei `20261102_recruitment_hardening.sql` wurde vom Nutzer heruntergeladen und bearbeitet, aber laut letztem bestätigten Stand noch nicht in Supabase ausgeführt. Vor einer Ausführung muss die Migration vollständig geprüft und mit dem aktuellen Datenbankstand abgeglichen werden. Tabellenrechte dürfen nicht pauschal entzogen werden, ohne die tatsächlichen Frontend-Zugriffe und benötigten SELECT-Rechte zu berücksichtigen.

## 7. Offene Aufgaben / bekannte Lücken

### Priorität 1 – Weltkarte dynamisch machen
- Definition und Rückgabe von `get_map_area` verifizieren.
- Sichere Datenquelle/RPC für Kartenbereich festlegen.
- Statische Barbarendorf-Testdaten entfernen.
- echte Dörfer, Besitzertypen und Koordinaten darstellen.
- echte, erlaubte Dorfinformationen in der Detailansicht anzeigen.
- Hex-Raster und bestehende Gestaltung erhalten.

### Priorität 2 – Datenbankhärtung abschließen
- Frontend-Zugriffe auf Tabellen und RPCs vollständig prüfen.
- Tabellenrechte und Funktionsrechte anhand dieser Zugriffe korrigieren.
- vorbereitete Recruitment-Hardening-Migration erneut vollständig prüfen.
- Migration erst nach Prüfung und ausdrücklicher Freigabe ausführen.
- anschließend Authentifizierung, Dorf, Bau und Rekrutierung testen.

### Priorität 3 – Kampf-/Bewegungssystem
- automatische Verarbeitung fälliger Bewegungen prüfen/implementieren.
- Kampfauflösung und Berichterstellung ergänzen.
- Rückkehr überlebender Truppen implementieren.
- Statusübergänge und parallele Verarbeitung testen.

### Weitere geplante Systeme
- Berichte
- Nachrichten
- Stämme/Allianzen
- Handel
- Weltgenerierung und Barbarendorf-Verteilung

## 8. Zusammenarbeit und Änderungsregeln

Vereinbarter Arbeitsablauf:
1. Claude übernimmt die Erstellung/Änderung von React-, TypeScript- und SQL-Code.
2. ChatGPT prüft die Ergebnisse gegen den tatsächlichen GitHub-Stand und die bekannten Datenbankabhängigkeiten.
3. Änderungen werden erst nach Prüfung in GitHub übernommen.
4. SQL wird nicht allein deshalb ausgeführt, weil Claude es erstellt hat. Erst Definitionen, Berechtigungen, Auswirkungen und Reihenfolge prüfen.
5. Bestehende Funktionen nicht blind überschreiben und keine Datenbankstruktur oder RPC-Parameter erfinden.
6. Kleine, nachvollziehbare Änderungen bevorzugen; nach jeder Änderung Build/Test ausführen, soweit möglich.
7. Projektstatus nach größeren Änderungen aktualisieren.

## 9. Nächster konkreter Schritt

Die Weltkarte dynamisch machen. Claude soll zuerst `WorldMap.tsx`, `WorldMap.css`, die aktuelle Supabase-RPC `get_map_area` und die Dorf-/Spielerschemata prüfen. Danach soll Claude einen konkreten Implementierungsvorschlag mit vollständigen Dateien und gegebenenfalls einer SQL-Migration liefern. Noch keine SQL-Migration ausführen, bevor sie geprüft wurde.
