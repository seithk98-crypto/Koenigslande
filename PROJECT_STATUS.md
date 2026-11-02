# Projektstatus

Stand: Phase F lokal geprüft; gehostete Umgebung und Produktionsbetrieb nicht geprüft.

## Phase A – Fundament

- React-/TypeScript-/Vite-Client mit Supabase Auth.
- Profile, persistente Welt I, Weltkarte mit 40.401 Feldern und neutralen Dörfern.
- Server-RPCs für idempotente Gründung des ersten Dorfs, eigene Dorfabfrage und Kartenregionen.
- RLS ohne direkte Client-Schreibrechte auf kritische Spieltabellen.

## Phase B – Wirtschaft

- Dorfbezogene Ressourcen, Lager- und Bevölkerungskapazität.
- Serverseitige, offline nachgerechnete Rohstoffproduktion und Fertigstellung von Bauaufträgen.
- Serielle Bauwarteschlange, serverseitige Kosten/Bauzeiten und idempotente atomare Abbuchungen.
- Übersicht und Ausbauaktionen in der Dorfansicht.

## Phase C – Militär und Rekrutierung

### Implementiert

- Acht zentral konfigurierbare Phase-C-Basiseinheiten mit Angriff, Verteidigung gegen Infanterie/Kavallerie, Geschwindigkeit, Traglast, Bevölkerung, Kosten, Ausbildungszeit und Gebäudestufenvoraussetzungen. Phase E ergänzt den Adligen als neunte, eroberungsrelevante Einheit.
- Kaserne, Stall, Werkstatt und Schmiede schalten passende Klassen bzw. Einheiten frei. Alle gesperrten Einheiten und Voraussetzungen sind in der Militäransicht sichtbar.
- Dorfgebundene Truppenbestände und je Ausbildungsstätte serielle Rekrutierungswarteschlangen.
- Serverseitige RPCs prüfen Identität, Dorfbesitz, Freischaltung, Ressourcen und freie Bevölkerung. Rohstoffe und Bevölkerung werden bei Einreihung atomar reserviert; Request-UUIDs und Dorfzeilensperren schützen vor Mehrfach- und Konkurrenzabbuchungen.
- Rekrutierungszeiten werden serverseitig unter Berücksichtigung des Hauptgebäudes berechnet. Offline abgeschlossene Aufträge werden beim nächsten Dorf-RPC dem richtigen Dorf gutgeschrieben.
- Auflösen fertiger Einheiten gibt deren Bevölkerungsplätze serverseitig frei.
- Militäransicht mit Bestand, Einheitenwerten, Voraussetzungen, Kosten-/Zeitvorschau, Mengenwahl, Aufträgen und Countdown.
- SQL- und Betriebshinweise in [docs/PHASE_C_MILITARY.md](docs/PHASE_C_MILITARY.md).

### Lokal geprüft

- Phase-C-Migration `202611020005` mit `npx supabase db push --local` angewendet; keine Spieler-, Dorf- oder Wirtschaftsdaten zurückgesetzt.
- 49 pgTAP-Tests für Phase A/B/C bestanden, einschließlich RLS und RPC-Berechtigungen.
- Phase-A/B/C-Integration bestanden: Anmeldung und Dorfgründung, Offline-Produktion, Lagerlimits, Rekrutierung mit ausreichenden/zu wenigen Ressourcen, Bevölkerungslimit, gesperrte Einheiten, gleiche und konkurrierende parallele Requests, Offline-Fertigstellung, Freigabe der Bevölkerung beim Auflösen und isolierte Bestände zweier Dörfer.
- 2 Vitest-Tests für Kartenkoordinaten einschließlich Weltgrenzen bestanden.
- Produktionsbuild/TypeScript und Oxlint erfolgreich.

### Nicht geprüft

- Migration und Verhalten gegen eine echte/gehostete Supabase-Instanz.
- Visuelle Browserprüfung auf mehreren Viewports.

## Phase D – Angriffe und Kampfsimulation

### Implementiert

- Eigene Dörfer als Ausgangspunkt; fremde und neutrale Dörfer als Ziele. Die Oberfläche zeigt Entfernung, unverbindliche Reisezeit, Angriffsstärke und Ankunftszeit und verlangt eine Bestätigung.
- Authentifizierte RPCs prüfen Dorfbesitz, Ziel, Bewegungstyp, Einheitencodes und verfügbare Truppen serverseitig. Serverseitige Distanz- und Reisezeitberechnung, Dorfsperren, Bewegungs-UUIDs und Transaktionen sichern parallele Anforderungen und doppelte Abbuchungen ab.
- Dauerhaft gespeicherte Angriffs- und Spähbewegungen; Ankunft, Kampf, Verluste und Rückkehr werden genau einmal verarbeitet. Überlebende kehren per eigener Bewegungszeile zum Ausgangsdorf zurück.
- Serverberechneter Kampf mit zentralen Einheitendefinitionen, Infanterie-/Kavallerie-Verteidigung, Versammlungsplatzbonus und dokumentiertem Zufallsfaktor von 0,9 bis 1,1.
- Bevölkerungsanpassung bei Verlusten sowie atomare Beute mit Traglast, freien Lagerplätzen und verfügbarem Zielbestand.
- Spionage mit erfolgsabhängigen Informationen und Späherverlusten. Fehlgeschlagene Berichte enthalten keine Zielaufstellung oder Rohstoffdaten.
- Eigene und eingehende Bewegungsübersicht mit zehnsekündiger Aktualisierung. Eingehende Truppenzahlen und gegnerische Zusammensetzungen bleiben verborgen.
- Persistente, pro Betrachter gefilterte Kampf- und Spähberichte. RLS ist aktiviert; Clients können Bewegungs- und Berichtstabellen nicht direkt lesen oder schreiben.
- SQL- und Formel-Dokumentation in [docs/PHASE_D_COMBAT.md](docs/PHASE_D_COMBAT.md). Migrationen `202611020006` und `202611020007` wurden lokal angewendet.

### Lokal geprüft

- 70 pgTAP-Tests für Phase A bis D bestanden, einschließlich Tabellenrechte, RPC-Rechte, RLS, Kampfwerte, Reisezeit, Traglast und Verlustgrenzen.
- Vollständige A–D-Integration bestanden: Anmeldung/Dorfgründung, Offline-Wirtschaft, Lagerlimits, Rekrutierung, Eigentums- und Eingabeprüfungen, Angriff auf ein fremdes Dorf, Ablehnung eigener Ziele, ungültige und unzureichende Truppen, parallele Bewegungen, Offline-Ankunft, einmalige Kampfauflösung, Rückkehr, Verluste, Bevölkerung, Beutegrenzen, Berichtstrennung sowie erfolgreiche und fehlgeschlagene Spionage.
- 2 Vitest-Tests bestanden.
- `npm run lint` ohne Warnungen/Fehler.
- `npm run build` einschließlich TypeScript-Prüfung erfolgreich.

### Nicht geprüft / Einschränkungen

- Keine Verbindung zu einer gehosteten oder produktiven Supabase-Instanz; die SQL-Migrationen müssen dort vor dem Einsatz manuell geprüft und angewendet werden.
- Keine visuelle Browserprüfung auf mehreren Viewports.
- Es gibt keinen periodischen Scheduler. Fällige Bewegungen laufen zeitlich weiter, werden aber erst bei der nächsten authentifizierten RPC verarbeitet. Ohne weitere Spieleranfragen wird kein Hintergrundprozess ausgeführt.
- Das vorhandene Phase-C-System besitzt keine Allianzen oder Unterstützungsbewegungen; verbündete Verteidiger werden daher noch nicht simuliert.

## Phase E – Multiplayer, Profile und Allianzen

### Implementiert

- Eindeutige Spielernamen, Avatar-URL, Profilbeschreibung, Registrierungsdatum, Punkte, Dorfanzahl und Allianzzugehörigkeit. Profile können aus Ranglisten und Mitgliederlisten geöffnet werden.
- Mehrdorf-Auswahl mit serverseitigem Laden eigener Dörfer. Gründung zusätzlicher Dörfer prüft zentrale Grenzwerte und zieht die Kosten atomar ab; Dorfzustände bleiben getrennt.
- Dynamische Weltkarte mit eigenen, neutralen, fremden und verbündeten Dörfern, Koordinaten, Punkten, Besitzer-/Allianzdaten und zugänglichen Bewegungsindikatoren.
- Allianzen mit eindeutigen Namen/Kürzeln, Profilbeschreibung, Gründer-/Anführer-/Diplomaten-/Mitgliedsrollen, Einladungen, Annahme/Ablehnung, Mitgliederverwaltung, Austritt und Auflösung.
- Bündnisse, Nichtangriffspakte und Feindschaften mit Anfrage, Annahme/Ablehnung und Beendigung. Beziehungen umgehen oder verändern derzeit nicht das Kampfsystem.
- Private Spieler- und Allianz-Nachrichten, Verlauf, Lesestatus sowie Archivieren/Löschen privater Nachrichten über geschützte RPCs.
- Dynamische Ranglisten für Spieler, Dörfer und Allianzen.
- Serverseitige Eroberung über Phase-D-Kämpfe mit überlebendem Adligen; Dorfobergrenze und Besitzerwechsel sind gegen parallele Gründungen/Eroberungen serialisiert.
- Nicht-sensitive Benachrichtigungen über Supabase Realtime sowie 30-Sekunden-Fallback; private Nachrichteninhalte bleiben RPC-geschützt.
- Additive SQL- und Betriebsdokumentation in [docs/PHASE_E_MULTIPLAYER.md](docs/PHASE_E_MULTIPLAYER.md).

### Migrationen

- Phase-E-Migrationen `202611020008` bis `202611020013` sind additive SQL-Änderungen. Sie müssen für gehostete Umgebungen manuell geprüft und angewendet werden.
- Migrationen `008` bis `013` wurden lokal angewendet; die Anwendung hat keine vorhandenen Spieler- oder Dorfdaten zurückgesetzt.
- Keine gehostete oder produktive Datenbank wurde verändert.

### Verifikation

- `npm run test:integration`: Phase A bis E erfolgreich, einschließlich Mehrdorf-Gründung/-Zugriff, Allianz-Einladungen und -Lebenszyklus, Rollen, Diplomatie, Nachrichten, Ranglisten, Eroberung, RLS und Testdatenbereinigung.
- `npm test`: 2 Tests erfolgreich.
- `npm run lint`: erfolgreich.
- `npm run build`: TypeScript und Vite erfolgreich; Vite meldet nur den bestehenden Hinweis auf einen JavaScript-Chunk über 500 kB.
- `npm run test:db`: TAP-Ausgabe meldete 102/102 Tests erfolgreich. Der Supabase-CLI-Prozess lieferte anschließend in dieser Umgebung Exit 130 bzw. brach in einem Folgelauf beim fehlenden `~/.supabase/profile` ab; die pgTAP-Ergebnisse waren grün, der CLI-Exitcode ist jedoch nicht zuverlässig.
- Browserdarstellung auf mehreren Geräten und gehostete Supabase-Konfiguration sind nicht geprüft.

## Nächste Phasen

- Produktionsvorbereitung: gehostete Migrationen und Auth-Konfiguration prüfen, Browser-/Mobilansichten testen und Lasttests gegen eine repräsentative Datenmenge ergänzen.
- Bekannte Grenzen: Es gibt keinen periodischen Hintergrund-Scheduler; fällige Aufträge/Bewegungen werden beim nächsten authentifizierten RPC verarbeitet. Diplomatiebeziehungen werden gespeichert und angezeigt, verändern aber derzeit nicht die Kampfregeln. Ranglisten zeigen jeweils höchstens 100 Einträge ohne Seitenwechsel.

## Phase F – Qualität, Sicherheit, Balance und Performance

### Befunde und Änderungen

- **P2, behoben:** Der anfängliche JavaScript-Chunk überschritt mit 516,79 kB die Vite-Warnschwelle. Die nur bei Auswahl benötigte Gemeinschaftsansicht wird jetzt dynamisch geladen; der initiale Chunk beträgt 496,58 kB, der zusätzliche Gemeinschafts-Chunk 22,47 kB.
- **P2, behoben:** Der 30-Sekunden-Refresh lud Ranglisten auch außerhalb des Ranglisten-Tabs und konnte bei langsamen Antworten überlappen. Ranglisten werden nun nur im aktiven Tab geladen; Multiplayer-Übersicht und Ranglisten verhindern parallele Folgeabfragen.
- **Security-Prüfung:** In den geprüften Migrationen und lokalen Tests wurde keine offene Berechtigungslücke festgestellt. Kritische Tabellen haben RLS und keine direkten Client-Schreibrechte; Kampf-, Wirtschafts-, Rekrutierungs-, Nachrichten- und Allianzaktionen laufen über authentifizierte RPCs. Die Prüfgrenzen stehen in [docs/PHASE_F_QUALITY.md](docs/PHASE_F_QUALITY.md).
- **Balance:** Keine Zahlen geändert. Es fehlen repräsentative Langzeit-/Spielerdaten für eine belastbare Kalibrierung; willkürliche Änderungen wurden vermieden. Der Phase-F-Bericht enthält die vollständige Einheitenübersicht.
- **Performance:** Kartenregionen sind auf höchstens 41 × 41 Felder begrenzt und Ranglisten auf je 100 Einträge. Ein großmaßstäblicher Lasttest wurde nicht durchgeführt.

### Verifikation

- `npm test`: 2 Tests bestanden.
- `npm run test:db`: 102 pgTAP-Tests bestanden.
- `npm run test:integration`: Phasen A–E erfolgreich, inklusive paralleler Requests, Idempotenz, RLS, Kampfauflösung, Mehrdorf, Allianzen, Nachrichten und Ranglisten.
- `npm run lint`: erfolgreich.
- `npm run build`: TypeScript und Vite erfolgreich. Der initiale Chunk ist unter 500 kB; die vorherige Vite-Warnung tritt nicht mehr auf.
- Keine gehostete Supabase-Instanz, kein Mehrgeräte-Browsercheck und kein repräsentativer Lasttest wurden durchgeführt.
- Phase F fügt keine Datenbankmigration hinzu. Für gehostete Umgebungen müssen die vorhandenen Migrationen `202611020001` bis `202611020013` weiterhin einzeln geprüft und ausdrücklich angewendet werden.

Der ausführliche Prüf- und Abschlussbericht steht in [docs/PHASE_F_QUALITY.md](docs/PHASE_F_QUALITY.md).

## Verifikation

```bash
npx supabase start --exclude vector
npx supabase db push --local
npm test
npm run test:db
npm run test:integration
npm run lint
npm run build
```

Die Migrationen der Phasen B bis E müssen für ein gehostetes Projekt manuell geprüft und angewendet werden. Hier wurde keine fremde oder produktive Datenbank verändert.
