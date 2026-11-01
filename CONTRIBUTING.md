# Mitwirken an Kronenreich

Danke für dein Interesse! Kronenreich ist ein frühes Open-Source-Projekt. Auch kleine, gut erklärte Beiträge helfen.

## Bevor du anfängst

1. Schau dir die vorhandenen [Issues](https://github.com/seithk98-crypto/medieval-srategy/issues) an.
2. Wenn du eine neue Idee oder einen Fehler gefunden hast, eröffne zuerst ein Issue und beschreibe kurz den Vorschlag.
3. Warte bei größeren Änderungen auf eine kurze Abstimmung, damit nicht mehrere Personen dieselbe Arbeit machen.

## Pull Requests

- Arbeite möglichst in einem eigenen Branch.
- Beschreibe im Pull Request, was du geändert hast und warum.
- Halte Änderungen überschaubar und konzentriere dich möglichst auf ein Thema.
- Führe im Ordner `client` mindestens `npm run build` aus und erwähne das Ergebnis im Pull Request.
- Ergänze bei Änderungen an Spiellogik passende Tests, sobald eine Teststruktur vorhanden ist.

## Technische Hinweise

- Frontend: React, TypeScript und Vite im Ordner `client`.
- Backend: Supabase. Änderungen an Tabellen, Policies oder RPC-Funktionen bitte nachvollziehbar dokumentieren.
- Sicherheitsrelevante Spielberechnungen (z. B. Kämpfe, Ressourcen und Truppenbewegungen) müssen serverseitig abgesichert sein. Vertraue dafür niemals ausschließlich auf Werte aus dem Browser.
- Keine echten Zugangsdaten, Tokens, Service-Role-Keys oder privaten Daten in Commits oder Issues veröffentlichen.
- Bitte keine destruktiven Datenbankänderungen oder Änderungen an produktiven Daten ohne vorherige Abstimmung.

## Kommunikation

Bitte schreibe Issues und Pull Requests möglichst auf Deutsch oder Englisch. Sei freundlich und respektvoll. Unterschiedliche Erfahrungsstände sind willkommen – Fragen sind ausdrücklich okay.

Vielen Dank, dass du Kronenreich mitentwickelst!
