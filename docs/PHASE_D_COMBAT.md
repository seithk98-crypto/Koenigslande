# Phase D – Angriffe, Spionage und Kampf

## Migration und Betrieb

Die Phase-D-Datenbankänderungen liegen in:

- `supabase/migrations/202611020006_phase_d_combat.sql`
- `supabase/migrations/202611020007_phase_d_return_fix.sql`

Die Migrationen ergänzen Bewegungen und private Berichte, sichern die Tabellen mit RLS und vergeben keine direkten Tabellenrechte an Clientrollen. Bestehende Dörfer erhalten nur dann einen Rohstoffbestand oder Versammlungsplatz, wenn der jeweilige Datensatz fehlt. Bestehende Spieler-, Dorf-, Wirtschafts- und Truppendaten werden nicht gelöscht.

Für lokale Entwicklung:

```bash
npx supabase db push --local
npm run test:db
npm run test:integration
```

Die Änderungen wurden lokal angewendet. Für eine gehostete oder produktive Supabase-Instanz müssen beide SQL-Dateien vorher geprüft und manuell angewendet werden. Kein produktives oder fremdes Projekt wurde verändert.

## Bewegungen und Serverprüfungen

- `send_troop_movement(source_id, target_id, movement_type, troops, request_id)` akzeptiert nur eigene Ausgangsdörfer, fremde oder neutrale Ziele derselben Welt, bekannte positive Truppenmengen und für Spähmissionen ausschließlich Späher. Bestandssperren, Dorfsperren, Transaktion und eindeutige Request-ID verhindern negative oder doppelt abgebuchte Bestände.
- Entfernung ist die euklidische Distanz der Dörfer. Die Reisezeit ergibt sich aus Entfernung mal langsamster entsandter Einheit in Minuten pro Feld. PostgreSQL setzt die verbindliche Ankunftszeit.
- Ankunft, Kampf, Beute und Rückkehr werden transaktional und idempotent verarbeitet. Fällige Bewegungen verarbeitet der nächste authentifizierte RPC eines Angreifers oder Dorfbesitzers. Ein separater periodischer Scheduler ist nicht eingerichtet; dadurch laufen Zeitstempel offline weiter, die Zustandsänderung wird aber erst bei der nächsten RPC-Anfrage geschrieben.
- `get_movement_overview()` liefert nur eigene Truppenbewegungen und eingehende Bewegungsmetadaten. Eingehende Truppenzahlen werden nicht offengelegt. Kampf- und Spähberichte sind nach Betrachter getrennt.
- Der frühere Phase-C-Bestand enthält kein System für unterstützende Truppen oder Allianzen; Unterstützung wird deshalb nicht vorgetäuscht oder in die Formel eingerechnet.

## Kampfformel

Alle Werte stammen serverseitig aus `app_private.unit_definitions`. Der Zufallsfaktor ist pro Kampf genau ein gleichverteilter Wert zwischen `0,9` und `1,1` und wird im Angreiferbericht protokolliert.

```text
Angriff = Summe(Anzahl_angreifender_Einheiten × Angriffswert) × Zufallsfaktor

Kavallerieanteil = angreifende Kavallerie / alle angreifenden Einheiten
Infanterieanteil = 1 − Kavallerieanteil

Verteidigung =
  Summe(Anzahl_Verteidiger ×
    (Infanteriewert × Infanterieanteil + Kavalleriewert × Kavallerieanteil))
  + 100 × (1 + 0,25 × Versammlungsplatzstufe)
```

Bei Angriffssieg werden die Verteidiger vollständig aufgerieben; Angreiferverluste betragen je Einheit `floor(Anzahl × min(0,8, Verteidigung / Angriff))`. Bei Verteidigersieg werden Angreifer vollständig aufgerieben; Verteidigerverluste betragen je Einheit `floor(Anzahl × min(0,8, Angriff / Verteidigung))`. Diese einfache Formel ist zentral implementiert und für späteres Balancing bewusst dokumentiert. Bevölkerung wird entsprechend den verlorenen Einheiten angepasst. Überlebende werden als eigene Rückkehrbewegung gespeichert.

Spähererfolg ist `clamp(0,15 + Späher / max(1, Verteidigungsspäher) × 0,08, 0,05, 0,95)`. Der Verlustanteil der Angreiferspäher beträgt `min(0,9, 0,1 + Verteidigungsspäher / max(1, Späher) × 0,75)`; Verluste werden je Einheit abgerundet. Nur bei erfolgreicher Spionage enthält der getrennte Spähbericht Truppen- und Rohstoffinformationen.

## Beute und Berichte

Bei einem Angriffssieg ist die Traglast der Überlebenden die Obergrenze. Zusätzlich werden freie Lagerplätze des Angreiferdorfs und tatsächlich vorhandene Rohstoffe des Ziels berücksichtigt. Die Entnahme erfolgt in der Reihenfolge Holz, Lehm, Eisen; Quelle und Ziel werden in einer Transaktion aktualisiert. Negative Bestände oder Überschreiten des Lagerlimits sind durch Sperren und Tabelleneinschränkungen ausgeschlossen.

Der Angreifer erhält den detaillierten Bericht mit beiden Truppenaufstellungen, Verlusten, Überlebenden, Ergebnis, Zufallsfaktor und Beute. Der Verteidiger erhält keinen angreifenden Truppenbestand und keine Angreiferverluste. Spähberichte liegen separat; ein Fehlversuch gibt keine Zielinformationen preis.

## Tests

`supabase/tests/phase_d.sql` prüft Tabellen, RLS, Rechte, zentrale Kampfformeln, Reisezeit, Traglast und Verlustgrenzen. `scripts/phase_d.integration.mjs` prüft mit zwei lokalen Konten Besitzprüfungen, eigene Ziele, ungültige und unzureichende Truppen, gleichzeitige Angriffe, einmalige Offline-Auflösung, Rückkehr, Beute, getrennte Berichte und erfolgreiche/fehlgeschlagene Spionage.
