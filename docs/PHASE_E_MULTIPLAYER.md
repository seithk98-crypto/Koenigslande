# Phase E – Multiplayer, Profile und Allianzen

## Datenmodell und Migration

Phase E ergänzt Profile um eindeutige Spielernamen, Avatar-URL und Beschreibung. Allianzen, Mitgliedsrollen, Einladungen, Diplomatie, private Nachrichten, Allianz-Nachrichten und nicht-sensitive Realtime-Benachrichtigungen werden dauerhaft in Supabase gespeichert. Mehrdorf-Gründung, Besitzerwechsel, Ranglisten und öffentliche Profile laufen über authentifizierte Server-RPCs.

Die additive SQL-Änderung liegt in den Migrationen `202611020008` bis `202611020013`. Sie setzt keine bestehenden Spieler-, Dorf-, Wirtschafts- oder Truppendaten zurück. Die Migrationen sind lokal testbar; für ein gehostetes Projekt müssen sie vor dem Einsatz separat geprüft und ausdrücklich angewendet werden. Keine Migration wird automatisch beim Start der App ausgeführt.

## Serverregeln und Berechtigungen

- Spielernamen sind case-insensitive eindeutig. Profiländerungen laufen über `update_player_profile`.
- `get_owned_villages` und `get_village_state(uuid)` liefern ausschließlich eigene Dörfer; Ressourcen, Gebäude und Truppen bleiben je Dorf getrennt.
- `found_additional_village(uuid,text)` verwendet die Regeln in `app_private.realm_rules`: höchstens 10 Dörfer, mindestens 100 Punkte, mindestens 5 Felder Abstand und 1.500 Holz/1.500 Lehm/1.000 Eisen. Die Gründung belastet das ausgewählte Ausgangsdorf atomar.
- Eine Eroberung erfolgt ausschließlich nach serverseitig aufgelöstem gewonnenem Angriff mit mindestens einem überlebenden Adligen. Der Zielbesitzerwechsel prüft erneut die Obergrenze und wird mit der Dorfgründung pro Spieler serialisiert. Adligenwerte und Voraussetzungen sind in `app_private.unit_definitions` konfiguriert.
- Allianz-, Mitglieder-, Einladungs-, Diplomatie-, Nachrichten- und Berichtsdaten sind nicht direkt für Client-Schreibzugriffe freigegeben. Aktionen und private Inhalte werden über RPCs mit serverseitiger Identitäts- und Rollenprüfung verarbeitet.
- Realtime veröffentlicht nur RLS-gefilterte Benachrichtigungsereignisse, keine Nachrichteninhalte oder verborgenen Truppeninformationen. Die Oberfläche aktualisiert soziale Daten zusätzlich höchstens alle 30 Sekunden.
- Ranglisten und Kartendaten stammen dynamisch aus Supabase. Öffentliche Kartenbewegungshinweise sind auf eigene bzw. eingehende Bewegungen begrenzt.

## Rollen und bekannte Grenzen

Die Rollen `founder`, `leader`, `diplomat` und `member` werden in den RPCs geprüft. Gründer und Anführer verwalten Mitglieder/Einladungen; Diplomaten dürfen Diplomatie verwalten; Mitglieder erhalten normale Allianzkommunikation. Diplomatiebeziehungen werden gespeichert und angezeigt, verändern aber derzeit nicht die Kampfregeln. Es gibt keinen periodischen Hintergrund-Scheduler; fällige Spielaufträge und Bewegungen werden bei authentifizierten RPC-Aufrufen nachgerechnet.

## Lokale Prüfung

```bash
npx supabase db push --local
npm run test:db
npm run test:integration
```

Der Phase-E-Integrationstest verwendet drei kurzlebige lokale Testkonten und prüft unter anderem Dorfgründung/-wechsel, Profilnamen, Allianz-Lebenszyklus und Rollen, Einladungen, Diplomatie, Nachrichten, Ranglisten, Kartenallianzen und Eroberung. Wenn kein Supabase-CLI-Profil vorliegt, signieren die Testskripte kurzlebige lokale Testschlüssel aus dem laufenden Auth-Container; Schlüssel werden nicht gespeichert oder ausgegeben. Es wurde keine gehostete oder produktive Supabase-Instanz geändert.
