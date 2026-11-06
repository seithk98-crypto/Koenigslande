# Grafik-Assets und Lizenzen

Stand: Prototyp der Landschaftskarte (`src/map/`).

## Aktueller Stand

**Es sind keine Fremd-Assets im Repository enthalten.** Die Landschaftskarte im Prototyp wird vollständig
prozedural im Code erzeugt (Canvas-Zeichnung aus `src/map/landscapePainter.ts` und
`src/map/landscapeScene.ts`). Dafür gelten keine Drittlizenzen; der Code steht unter der Lizenz des Projekts.

## Kandidaten-Tilesets (noch nicht geprüft)

Beim Prototyp waren die Download- und Lizenzseiten aus der Entwicklungsumgebung nicht erreichbar
(Zugriff durch den Netzwerk-Proxy blockiert). Die Lizenzbedingungen wurden deshalb **nicht verifiziert**
und hier bewusst nicht wiedergegeben.

| Paket | Verwendung | Status |
| --- | --- | --- |
| reodesuxz – Forest-and-Village | Weltkarte (erster Prototyp) | nicht verifiziert, nicht eingebunden |
| FreeGameSprites – Medieval Village | spätere Dorfübersicht | nicht verifiziert, nicht eingebunden |
| Sova Digital – HD | spätere Dorfübersicht | nicht verifiziert, nicht eingebunden |

Vor jeder Einbindung ist pro Paket zu prüfen und hier einzutragen:

1. Lizenzname und Link zur Lizenzseite (Datum der Prüfung)
2. Kommerzielle Nutzung erlaubt?
3. Pflicht zur Namensnennung (Wortlaut)
4. Weitergabe der Dateien in einem öffentlichen Repository erlaubt?
5. Änderungen/Bearbeitung der Grafiken erlaubt?

## Sprite-Atlas einbinden

`src/map/spriteAtlas.ts` lädt optional `public/assets/map/active/manifest.json`. Ist keine Datei vorhanden,
zeichnet die Karte prozedural. Das Manifest wird streng geprüft und **muss** die Felder `license` und `source`
enthalten, sonst wird es ignoriert. Felder: `name`, `image`, `tileSize`, `license`, `source` und `sprites`
je Dekor-Art (`oak`, `pine`, `bush`, `tuft`, `flower`, `rock`, `hill`, `reed`, `puddle`).

Platzierung und Variantenwahl der Sprites folgen den globalen Weltkoordinaten (deterministischer Hash), die
Karte ändert sich also beim Verschieben nicht.
