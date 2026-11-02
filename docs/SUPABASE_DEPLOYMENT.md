# Supabase und Frontend bereitstellen

## Aktueller Verbindungsstatus

Die lokale `.env.local` zeigt jetzt auf das bestätigte Frankfurt-Projekt `uckzfsfrxqmicpaongbi` (`eu-central-1`). Der darin hinterlegte Publishable-Key wurde intern mit den API-Keys des Projekts verglichen; Schlüsselwerte werden in dieser Dokumentation nicht gespeichert. `npx supabase link` verknüpft dieses Projekt mit dem lokalen Supabase-Arbeitsverzeichnis.

Die 13 Migrationen `202611020001` bis `202611020013` wurden am 2026-11-02 nach Projektidentitätsprüfung, Dry-run und ausdrücklicher Freigabe auf diesem Remote-Projekt angewendet. Die Remote-Historie stimmt mit den lokalen Migrationen überein. Das Remote-Schema enthält 18 Anwendungstabellen in `public` und zwei in `app_private`; alle 20 haben RLS. Geprüft wurden außerdem 60 Funktionen, vier benutzerdefinierte Trigger, 43 Indizes und drei Policies.

Eine lesende Grant-Prüfung fand keine unerwarteten Tabellenrechte für `anon` oder `authenticated`; `app_private` ist für beide Rollen nicht nutzbar. Die einzige anon-ausführbare `SECURITY DEFINER`-Funktion ist `public.rls_auto_enable`, eine PostgreSQL-Event-Trigger-Funktion des Providers auf `ddl_command_end`; sie ist kein Spiel-RPC. Ein anonymer SDK-Aufruf von `get_my_starting_village()` wurde mit `42501 permission denied` abgewiesen, wie für diese geschützte Funktion erwartet.

Vor der Migration ergab der lesende Zähler `auth.users = 0` und das Schema `public` war leer. Auth-Einstellungen antworten mit HTTP 200; Registrierung ist aktiviert. E-Mail-Bestätigung wurde für den Test vorübergehend deaktiviert und war beim letzten Remote-Check weiterhin aus. Du hast mitgeteilt, dass dein Free-Tarif kein Backup/PITR anbietet; eine unabhängige Dashboard-Prüfung wurde nicht ausgeführt. Damit sind spätere Spielerdaten nicht durch PITR geschützt. E-Mail-Bestätigung vor öffentlichem Livebetrieb wieder einschalten und SMTP-Zustellung verifizieren.

Die zuvor verwendete Irland-Projekt-Referenz erscheint nicht in der aktuellen CLI-Projektliste; es wurde kein Befehl gegen dieses Projekt ausgeführt, sein aktueller Status ist hier aber nicht verifiziert.

## Erforderliche Frontend-Variablen

In der Hosting-Plattform als Build-Variablen konfigurieren:

| Variable | Wert |
| --- | --- |
| `VITE_SUPABASE_URL` | Projekt-API-URL in der Form `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Öffentlicher Publishable-Key (`sb_publishable_...`) oder der öffentliche Legacy-`anon`-Key aus dem Supabase-Dashboard. |

Vite bindet `VITE_*` beim Build in das Browser-Bundle ein. Diese Werte sind daher öffentlich. Niemals `service_role`, `sb_secret_*`, Datenbankpasswörter, SMTP-Passwörter oder `SUPABASE_ACCESS_TOKEN` als `VITE_*` setzen oder in Frontend-Dateien eintragen. Der Service-Role-Key darf ausschließlich in vertrauenswürdigen serverseitigen Betriebswerkzeugen verwendet werden; die Web-App benötigt ihn nicht.

Lokal bleibt die Einstellung aus `.env.example` gültig: `VITE_SUPABASE_URL=/supabase` und der lokale anon-Key. Die lokale URL ist kein Produktionswert.

## Sicherer Remote-Migrationsablauf

Die Migrationen sind nummeriert und bauen aufeinander auf. Der bisher verifizierte lokale Stand enthält alle 13 Dateien. Der Remote-Stand ist unbekannt. Nicht `db reset` verwenden und kein `db push` ausführen, bevor alle folgenden Schritte erledigt sind:

1. Projekt-Referenz im Supabase-Dashboard feststellen und sicherstellen, dass es das richtige Projekt und die richtige Umgebung ist.
2. Supabase CLI lokal authentifizieren (`npx supabase login`) oder ein kurzlebiges `SUPABASE_ACCESS_TOKEN` ausschließlich als geschützte lokale Umgebungsvariable bereitstellen. Token niemals in Chat, `.env*`, Git oder Frontend-Build-Variablen kopieren.
3. Mit `npx supabase link --project-ref <project-ref>` verknüpfen und den Remote-Migrationsstand mit `npx supabase migration list --linked` nur lesend erfassen.
4. Datenbestand und Migrationstabelle prüfen. Bei vorhandenen wichtigen Daten zuerst einen verifizierten Provider-Backup-/PITR-Punkt oder einen verschlüsselten vollständigen Datenbankexport erstellen und dessen Wiederherstellbarkeit sicherstellen.
5. Lokale Dateien und Remote-Migrationshistorie abgleichen. Bereits angewendete Migrationen nicht erneut markieren oder editieren; ausstehende Migrationen samt Datenwirkung einzeln prüfen. `npx supabase db push --dry-run --linked` verwenden und den angezeigten Plan kontrollieren.
6. Erst nach Backup, korrektem Projekt und ausdrücklicher Freigabe den geprüften Plan anwenden. Anschließend Migrationsstand, Tabellen, Funktionen, RLS und RPC-Rechte auf dem Remote-Projekt erneut kontrollieren und den Smoke-Test mit eigens angelegten Testkonten durchführen.

Die Migrationsdateien `202611020001` bis `202611020013` enthalten Schemaänderungen, Trigger, RPCs und initiale Welt-Daten. Sie wurden lokal geprüft und einmalig auf das bestätigte Frankfurt-Projekt angewendet. Phase F enthält keine neue Migration.

## Supabase-Dashboard vor Produktion

- **Authentication → URL Configuration:** `Site URL` auf die kanonische HTTPS-Frontend-Adresse setzen. Nur tatsächlich verwendete Produktions- und Preview-Redirects exakt unter `Redirect URLs` erlauben; keine breiten Wildcards.
- **Authentication → Providers / Email:** E-Mail-Provider aktivieren und Bestätigungsregel bewusst festlegen. Bei aktivierten Bestätigungen produktiven SMTP-Anbieter, Absenderdomain und Vorlagen testen. Die lokale Konfiguration deaktiviert E-Mail-Bestätigung und ist keine Produktionsvorgabe.
- **Authentication → Security:** Mindestpasswortlänge mindestens 8 Zeichen setzen; Registrierungs-/OTP-Ratenlimits sowie CAPTCHA bei öffentlicher Registrierung nach Bedrohungsmodell konfigurieren. Die App verlangt im Formular mindestens 8 Zeichen.
- **Database:** Backups/PITR und Aufbewahrung passend zum Betriebsziel aktivieren; SSL erzwingen, sofern alle eingesetzten Clients TLS unterstützen. Nach aktuellem Stand ist PITR für das hier gewählte Free-Projekt nicht verfügbar (Nutzerangabe). Zugangsdaten nicht für Browserclients verwenden.
- **API / Database privileges:** Nur benötigte Data-API-Schemas freigeben. `app_private` nicht exponieren. RLS und Grants nach Migrationen gegen `anon` und `authenticated` kontrollieren; niemals Tabellenzugriff durch pauschale Grants freischalten.
- **Realtime:** Prüfen, dass nur `multiplayer_notifications` in der Publication ist und die Empfänger-RLS aktiv ist. Nachrichteninhalte dürfen nicht über Realtime veröffentlicht werden.
- **Betrieb:** Monitoring, Alarmierung, Backup-Wiederherstellung und verantwortliche Rotation von Schlüsseln festlegen. Gehostete Projekt- und Netzwerkregeln wurden hier nicht geprüft.

## Frontend-Deployment

1. In der Hosting-Plattform die obigen zwei `VITE_*`-Variablen für die richtige Supabase-Umgebung setzen.
2. Build mit `npm ci && npm run build` ausführen; das veröffentlichte Verzeichnis ist `dist/`. Vite-Variablen sind Build-time-Werte; bei Änderung neu bauen.
3. HTTPS aktivieren. Wenn die Hosting-Plattform clientseitige Pfade nutzt, unbekannte Anwendungsrouten auf `index.html` zurückleiten.
4. In Supabase `Site URL` und erlaubte Redirects auf exakt diese Domain abstimmen.
5. Nach Veröffentlichung mit zwei dedizierten Testkonten Registrierung, Bestätigung/Login, Abmeldung, Neuladen und Session-Wiederherstellung, Dorfgründung, fremden Dorfzugriff sowie Nachrichten-/Allianzgrenzen testen. Testdaten nur in einer nichtproduktiven Umgebung anlegen.

## Lokal bestätigte Prüfungen und offene Punkte

- Local: Auth-Health HTTP 200; Client-URL ist lokaler Proxy; anon-Key stimmt mit dem lokalen Stack überein.
- Local: alle 13 Migrationen in der lokalen Migrationshistorie eingetragen; 102 pgTAP-Tests und Phase-A–E-Integration bestanden.
- Auth-Integration deckt Registrierung, Abmeldung, erneute Anmeldung und persistentes Dorf über Sessions ab. Ein Browser-Neuladen zur expliziten Session-Wiederherstellung wurde nicht automatisiert geprüft.
- `db lint --local --schema public` meldet keine Fehler, aber bestehende Warnungen zu einer Text/UUID-Zuweisung und ungenutzten Variablen in älteren RPCs. Der vollständige Lint meldet zusätzlich pgTAP-Extension-Fehler, weil dynamische Testhilfen außerhalb eines Testlaufs linten.
- Remote geprüft: Frankfurt-URL und Publishable-Key stimmen mit Projekt `uckzfsfrxqmicpaongbi` überein; alle 13 Migrationen angewendet; Anwendungstabellen, RLS, Grants und Katalogobjekte kontrolliert.
- Auth-Settings: Registrierung aktiv; Bestätigung ist vorübergehend aus. Der erste Signup-Versuch mit Bestätigung wurde durch `over_email_send_rate_limit` abgewiesen und erzeugte kein Konto. Danach hast du zwei Testkonten angelegt. Passwörter wurden nicht übernommen. Bestätigung vor öffentlichem Livebetrieb wieder einschalten.
- Remote-Multiplayer-Bestandsprüfung: Zwei Auth-Konten und Profile, je ein eigenes Dorf, je ein Ressourcenbestand und je 12 Startgebäude. Beide Dörfer liegen in derselben Welt. Abfrage war aggregiert und gab keine IDs oder Adressen aus.
- Remote-Besitzschutz: `get_village_state` mit dem ersten Spieler-Claim gegen das Dorf des zweiten lieferte `P0002 Eigenes Dorf nicht gefunden`. Das war eine SQL-seitige Claim-Simulation, kein Browser-JWT-Test.
- Erster Browser-Auth-Smoke-Test: Du hast Login mit dem ersten Konto und Session-Erhalt nach Browser-Neuladen bestätigt. Das ist eine Nutzerbestätigung, kein automatisierter Browserlauf. Ein zweites separates Browserprofil mit gleichzeitig aktiver zweiter Identität ist noch offen; normale Tabs teilen denselben localStorage-Auth-Zustand und wechseln erwartungsgemäß gemeinsam den Account.
- Noch nicht getestet: Remote-Bau-/Rekrutierungsaktionen, echte parallele Remote-Spielrequests und vollständige Spielinteraktion. Nutzerpasswörter wurden nicht erhoben oder verwendet. Lokale Phasen-A–E-Integration deckt Wirtschaft, Bau, Rekrutierung, Kampf und Konkurrenzrequests im lokalen Stack ab.
- Lokale Abschlussgates nach dem Remote-Setup: `npm test` (2 Tests), `npm run test:db` (102 Tests), `npm run test:integration` (Phasen A–E), `npm run lint` und `npm run build` erfolgreich.
- SMTP ist nicht als eingerichtet bestätigt. Vor Livebetrieb Bestätigung wieder einschalten, eigenen SMTP-Anbieter verifizieren und Registrierung/Bestätigungslink/Passwort-Reset end-to-end testen.
- Auth-Benutzerzahl vor Migration: 0. Die frühere Irland-Projekt-Referenz erscheint nicht in der aktuellen CLI-Projektliste; kein Befehl wurde gegen sie ausgeführt, aktueller Status unbekannt.
- PITR-Verfügbarkeit beruht auf Nutzerangabe zum Free-Tarif, nicht auf einer unabhängigen Dashboard-Prüfung. Frontend-Hosting und extern erreichbare Browser-App sind noch nicht veröffentlicht.
