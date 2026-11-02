# Königslande Next
## Stand

Phase A bis E sind umgesetzt: Supabase-Authentifizierung, ein gemeinsames PostgreSQL-Weltmodell, serverseitige Wirtschaft und Rekrutierung, Angriffe/Kämpfe sowie Multiplayer mit mehreren Dörfern, Profilen, Allianzen, Diplomatie, Nachrichten und Ranglisten. Kritische Spielaktionen und Kampfverarbeitung erfolgen serverseitig; es gibt keine lokale Fake-Anmeldung oder im Browser simulierte Spielökonomie.

Die verschiebbare/zoombare Karte rendert begrenzte Datenbankabfragen. Die einzelnen Phasen sind in [PROJECT_STATUS.md](PROJECT_STATUS.md) dokumentiert. SQL, Serverregeln und manuelle Migration: [Phase B – Wirtschaft](docs/PHASE_B_ECONOMY.md), [Phase C – Militär](docs/PHASE_C_MILITARY.md), [Phase D – Kampf](docs/PHASE_D_COMBAT.md), [Phase E – Multiplayer](docs/PHASE_E_MULTIPLAYER.md) und [Phase F – Qualität, Sicherheit und Performance](docs/PHASE_F_QUALITY.md).

## Technik

- React und TypeScript mit Vite
- Supabase Auth für echte Benutzeridentität
- PostgreSQL als gemeinsame, dauerhafte Weltquelle
- RLS ohne direkte Client-Schreibrechte auf kritische Spieltabellen
- Authentifizierte RPCs für Dorfgründung, eigenes Dorf und begrenzte Kartenregionen
- Server-RPCs für Truppenbewegungen, Angriffe, Spionage, Kampfberichte, Beute und Rückkehr
- Vitest für Client-Logik und pgTAP für Datenbankrechte/Invarianten

Architektur und Berechtigungen: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Lokal starten

Voraussetzungen: Node.js/npm, Docker und die Supabase CLI.

```bash
npm install
npx supabase start --exclude vector
```

Lege `.env.local` im Projektstamm an. Verwende den `ANON_KEY` aus `npx supabase status --output env`; der Schlüssel ist der öffentliche lokale Client-Schlüssel. Die lokale URL bleibt `/supabase` und wird vom Vite-Devserver same-origin an den Supabase-Port weitergeleitet. Niemals `SERVICE_ROLE_KEY` oder `SECRET_KEY` in Vite-Variablen eintragen.

```env
VITE_SUPABASE_URL=/supabase
VITE_SUPABASE_ANON_KEY=DEIN_LOKALER_ANON_KEY
```

Dann:

```bash
npm run dev -- --host 0.0.0.0
```

Die Migrationen erzeugen eine feste Welt mit 40.401 Geländefeldern und neun persistenten, anfangs neutralen Dörfern. Neue, ausstehende Migrationen werden lokal mit `npx supabase db push --local` angewendet; der Befehl setzt keine vorhandenen lokalen Spielerdaten zurück. Für ein gehostetes Projekt müssen die SQL-Dateien separat geprüft und ausdrücklich angewendet werden. Keine Migration wird automatisch beim App-Start ausgeführt.

Im lokalen Supabase-Projekt sind E-Mail-Bestätigungen deaktiviert, damit der Auth-Ablauf ohne SMTP-Konto testbar ist. Eine gehostete Instanz muss ihre E-Mail-Bestätigung und Redirect-URLs selbst konfigurieren.

## Prüfen

```bash
npm test
npm run test:db
npm run test:integration
npm run lint
npm run build
```

Der Integrationstest legt ein zufälliges Testkonto an und löscht es danach samt Dorf wieder. Er benötigt den laufenden lokalen Supabase-Stack.

Für Anmeldung gegen eine echte gehostete Datenbank müssen die Migrationen dort separat angewendet und die Auth-Redirect-URLs des Projekts konfiguriert werden. Eine Verbindung zu einem produktiven Supabase-Projekt wurde hier nicht getestet.
