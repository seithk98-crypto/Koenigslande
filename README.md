# Königslande

**Königslande** ist ein kostenloses, browserbasiertes Mittelalter-Strategiespiel, inspiriert von klassischen Dorf- und Aufbauspielen wie *Die Stämme*. Das Projekt befindet sich in aktiver Entwicklung.

Ziel ist ein faires Open-Source-Spiel ohne Pay-to-Win: Fortschritt soll durch Planung, Ausbau, Handel und Strategie entstehen – nicht durch Echtgeldvorteile.

> **Status:** früher Entwicklungsstand. Das Projekt ist noch kein vollständiges oder öffentlich gehostetes Spiel. Funktionen, Datenmodell und Spielregeln können sich ändern.

## Aktueller Stand

Bereits begonnen bzw. vorhanden:

- Registrierung und Anmeldung über Supabase
- Dorfansicht mit Rohstoffen und Gebäuden
- Gebäudeausbau und Bauzeiten
- Bevölkerungs- und Lagerkapazität
- Truppenübersicht und Rekrutierung
- Erste technische Grundlagen für Truppenbewegungen und Angriffe

Noch in Arbeit bzw. geplant:

- Weltkarte und Weltgenerierung
- Verteilung von Spieler- und Barbarendörfern
- vollständige serverseitige Kampfberechnung
- Berichte und Rückkehr überlebender Truppen
- Handel, Stämme/Allianzen und weitere Spielsysteme

## Technologie

- React
- TypeScript
- Vite
- Supabase (Authentifizierung und Backend)

## Lokal starten

Voraussetzungen: eine aktuelle Node.js-Version und npm sowie ein eigenes Supabase-Projekt.

1. Repository klonen:

   ```bash
   git clone https://github.com/seithk98-crypto/medieval-srategy.git
   cd medieval-srategy/client
   ```

2. Abhängigkeiten installieren:

   ```bash
   npm install
   ```

3. Datei `.env.local` im Ordner `client` anlegen und die Werte deines eigenen Supabase-Projekts eintragen:

   ```env
   VITE_SUPABASE_URL=https://DEIN-PROJEKT.supabase.co
   VITE_SUPABASE_ANON_KEY=DEIN_SUPABASE_ANON_KEY
   ```

4. Entwicklungsserver starten:

   ```bash
   npm run dev
   ```

Für einen Produktions-Build:

```bash
npm run build
```

**Wichtig:** Niemals Service-Role-Keys, Passwörter oder andere geheime Zugangsdaten committen. Für lokale Tests ein eigenes Supabase-Projekt verwenden. Die Datenbank benötigt außerdem das zum aktuellen Code passende Schema und die benötigten Funktionen (RPCs); eine vollständige automatische Datenbankinstallation ist derzeit noch nicht dokumentiert.

## Mithelfen

Beiträge von Entwicklerinnen und Entwicklern sind willkommen – besonders bei:

- React-/TypeScript-Frontend
- Supabase, SQL und sicherer serverseitiger Spiellogik
- Weltkarte und prozeduraler Weltgenerierung
- Balancing und Spielmechaniken
- Tests, Dokumentation und UI/UX

Bitte zuerst ein [Issue](https://github.com/seithk98-crypto/medieval-srategy/issues) eröffnen oder dort nachsehen, woran bereits gearbeitet wird. Für Änderungen anschließend einen Pull Request erstellen. Lies dazu [CONTRIBUTING.md](CONTRIBUTING.md).

## Projektstatus und Kontakt

Das Projekt wird derzeit von einer kleinen Initiative aufgebaut. Ideen, konstruktive Rückmeldungen und Hilfe sind ausdrücklich willkommen. Bitte beachte, dass noch nicht alle geplanten Funktionen umgesetzt sind.

---

**Sprache:** Deutsch (weitere Sprachen können später ergänzt werden).
