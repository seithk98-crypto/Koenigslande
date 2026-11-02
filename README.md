# Königslande

**Königslande** ist ein kostenloses, browserbasiertes Mittelalter-Strategiespiel, inspiriert von klassischen Dorf- und Aufbauspielen wie *Die Stämme*. Das Projekt befindet sich in aktiver Entwicklung.

Ziel ist ein faires Open-Source-Spiel ohne Pay-to-Win: Fortschritt soll durch Planung, Ausbau, Handel und Strategie entstehen – nicht durch Echtgeldvorteile.

> **Status:** lokaler, spielbarer Prototyp. Anmeldung und Spielstände werden nur im Browser gespeichert; es gibt derzeit kein echtes Benutzerkonto, keinen Multiplayer-Server und keine serverseitige Validierung.

## Aktueller Stand

Im lokalen Prototyp vorhanden:

- Lokale Profilregistrierung und Anmeldung als Prototyp
- Profilgebundene Spielstände in `localStorage`
- Dorfansicht mit Rohstoffen und Gebäuden
- Gebäudeausbau und Bauzeiten
- Bevölkerungs- und Lagerkapazität
- Truppenübersicht und Rekrutierung
- Weltkarten-Prototyp mit Barbarendörfern und Truppenbewegungen

Noch in Arbeit bzw. geplant:

- Serverbasierte Authentifizierung und persistente Welt
- Erweiterte Weltgenerierung und Verteilung von Spielerdörfern
- Verteilung von Spieler- und Barbarendörfern
- vollständige serverseitige Kampfberechnung
- Berichte und Rückkehr überlebender Truppen
- Handel, Stämme/Allianzen und weitere Spielsysteme

## Technologie

- React
- TypeScript
- Vite
- Supabase (vorgesehenes Backend, aktuell noch nicht in den lokalen Spielablauf integriert)

## Dokumentation

- [PROJECT_STATUS.md](PROJECT_STATUS.md) – Aktueller Entwicklungsstand und nächste Schritte
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) – Architekturentscheidungen und Sicherheitsmodell

## Lokal starten

Voraussetzungen: eine aktuelle Node.js-Version und npm. Ein Supabase-Projekt wird für den lokalen Prototyp nicht benötigt.

1. Repository klonen:

   ```bash
   git clone https://github.com/seithk98-crypto/medieval-srategy.git
   cd medieval-srategy/client
   ```

2. Abhängigkeiten installieren:

   ```bash
   npm install
   ```

3. Entwicklungsserver starten:

   ```bash
   npm run dev
   ```

Für einen Produktions-Build:

```bash
npm run build
```

**Wichtig:** Die lokale Anmeldung ist keine sichere Authentifizierung: Die Eingaben werden nicht serverseitig geprüft. Verwende keine echten oder wiederverwendeten Passwörter. Spielstände liegen im Browser und können dort gelöscht oder verändert werden. Supabase-Schema und RPCs müssen vor einem Multiplayer- oder Produktivbetrieb implementiert werden.

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
