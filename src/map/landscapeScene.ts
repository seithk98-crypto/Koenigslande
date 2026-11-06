/**
 * Reine Szenenlogik der Landschaftskarte (ohne Canvas und ohne React).
 *
 * Eingabe sind ausschließlich die echten `WorldTile`-Daten aus `get_world_map`.
 * Alles Zusätzliche (Bodenfarbe, Bäume, Hügel, Dorfhäuser) wird deterministisch aus
 * den globalen Weltkoordinaten und dem Gelände abgeleitet. Verschiebt der Spieler
 * die Karte, bleibt jedes Element an derselben Weltposition und sieht gleich aus.
 *
 * Koordinaten: Ein Feld (x, y) belegt in Weltkoordinaten [x − 0,5 ; x + 0,5) ×
 * [y − 0,5 ; y + 0,5). y wächst nach Norden (wie in der Datenbank).
 */
import type { WorldTile } from '../types.ts'
import { fbm, hash01, hashInt, smoothstep, valueNoise } from './mapNoise.ts'

export const WORLD_MIN = -100
export const WORLD_MAX = 100

export type Terrain = WorldTile['terrain']
/** `sea` liegt außerhalb der Welt (Weltrand) und existiert nicht in der Datenbank. */
export type GroundTerrain = Terrain | 'sea'
export type TerrainLookup = (x: number, y: number) => GroundTerrain

export type Rgb = readonly [number, number, number]

export const GROUND_PALETTE: Record<GroundTerrain, Rgb> = {
  plains: [158, 176, 96],
  forest: [84, 120, 72],
  hills: [186, 160, 108],
  marsh: [112, 148, 124],
  sea: [102, 136, 150],
}

const TERRAIN_INDEX: Record<GroundTerrain, number> = { plains: 0, forest: 1, hills: 2, marsh: 3, sea: 4 }
const TERRAIN_ORDER: GroundTerrain[] = ['plains', 'forest', 'hills', 'marsh', 'sea']
const TERRAIN_MOTTLE = [0.1, 0.2, 0.12, 0.16, 0.06]
const INK: Rgb = [48, 40, 28]

/* ------------------------------------------------------------------ */
/* Kartenausschnitt                                                    */
/* ------------------------------------------------------------------ */

export type BoardGeometry = {
  /** Weltkoordinate x der ersten Spalte (Feldmitte). */
  originX: number
  /** Weltkoordinate y der obersten Zeile (Feldmitte). */
  topY: number
  /** Anzahl Spalten = Zeilen. */
  size: number
}

/**
 * Der Ausschnitt ist immer um die Kartenmitte zentriert und wird am Weltrand nicht
 * verschoben. Felder außerhalb der Welt erscheinen als Meer.
 */
export function boardGeometry(center: { x: number; y: number }, radius: number): BoardGeometry {
  return { originX: center.x - radius, topY: center.y + radius, size: radius * 2 + 1 }
}

/** 1-basierte Grid-Position eines Felds im Ausschnitt (für CSS-Grid). */
export function tileCell(geo: BoardGeometry, x: number, y: number) {
  return { column: x - geo.originX + 1, row: geo.topY - y + 1 }
}

/** Weltkoordinate → Pixel auf einer Zeichenfläche mit `tilePx` Pixeln je Feld. */
export function worldToBoard(geo: BoardGeometry, wx: number, wy: number, tilePx: number) {
  return { px: (wx - geo.originX + 0.5) * tilePx, py: (geo.topY - wy + 0.5) * tilePx }
}

/** Zeichenmaßstäbe: Feldgröße des Endbilds und Auflösung des Bodens. */
export function boardScales(size: number) {
  const tilePx = Math.min(96, Math.max(28, Math.round(720 / size)))
  const groundPxPerTile = Math.min(40, Math.max(12, Math.round(560 / size)))
  return { tilePx, groundPxPerTile }
}

/* ------------------------------------------------------------------ */
/* Geländeabfrage                                                      */
/* ------------------------------------------------------------------ */

type TileLike = Pick<WorldTile, 'x' | 'y' | 'terrain'>

function tileKey(x: number, y: number) {
  return (x + 512) * 2048 + (y + 512)
}

/**
 * Liefert das Gelände für beliebige Weltkoordinaten. Außerhalb der Welt: Meer.
 * Innerhalb der Welt, aber außerhalb des geladenen Ausschnitts: das nächstliegende
 * geladene Feld (nur relevant, solange neue Daten noch unterwegs sind).
 */
export function createTerrainLookup(tiles: readonly TileLike[]): TerrainLookup {
  const map = new Map<number, Terrain>()
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const tile of tiles) {
    map.set(tileKey(tile.x, tile.y), tile.terrain)
    if (tile.x < minX) minX = tile.x
    if (tile.x > maxX) maxX = tile.x
    if (tile.y < minY) minY = tile.y
    if (tile.y > maxY) maxY = tile.y
  }
  return (x, y) => {
    if (x < WORLD_MIN || x > WORLD_MAX || y < WORLD_MIN || y > WORLD_MAX) return 'sea'
    const hit = map.get(tileKey(x, y))
    if (hit) return hit
    if (map.size === 0) return 'plains'
    const cx = Math.min(maxX, Math.max(minX, x))
    const cy = Math.min(maxY, Math.max(minY, y))
    return map.get(tileKey(cx, cy)) ?? 'plains'
  }
}

/* ------------------------------------------------------------------ */
/* Boden: weich ineinander übergehende Geländeflächen                  */
/* ------------------------------------------------------------------ */

export type GroundImage = { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> }

/**
 * Rendert den Boden als RGBA-Pixel. Die Geländegrenzen werden mit Rauschen
 * verzerrt (wellige, organische Ränder), weich gemischt und mit einer dünnen
 * „Tuschelinie“ nachgezogen. Pinselstrich- und Körnungsrauschen hängt an den
 * Weltkoordinaten, nicht am Bildschirm.
 */
export function renderGround(geo: BoardGeometry, pxPerTile: number, lookup: TerrainLookup): GroundImage {
  const width = geo.size * pxPerTile
  const height = geo.size * pxPerTile
  const data = new Uint8ClampedArray(width * height * 4)
  const weights = new Float32Array(5)
  const colors = TERRAIN_ORDER.map((terrain) => GROUND_PALETTE[terrain])

  for (let j = 0; j < height; j += 1) {
    const wy = geo.topY + 0.5 - (j + 0.5) / pxPerTile
    for (let i = 0; i < width; i += 1) {
      const wx = geo.originX - 0.5 + (i + 0.5) / pxPerTile

      const ux = wx + (fbm(wx * 0.9, wy * 0.9, 11, 2) - 0.5) * 0.95
      const uy = wy + (fbm(wx * 0.9 + 40, wy * 0.9 + 17, 23, 2) - 0.5) * 0.95
      const x0 = Math.floor(ux)
      const y0 = Math.floor(uy)
      const tx = smoothstep(0.25, 0.75, ux - x0)
      const ty = smoothstep(0.25, 0.75, uy - y0)

      weights.fill(0)
      weights[TERRAIN_INDEX[lookup(x0, y0)]] += (1 - tx) * (1 - ty)
      weights[TERRAIN_INDEX[lookup(x0 + 1, y0)]] += tx * (1 - ty)
      weights[TERRAIN_INDEX[lookup(x0, y0 + 1)]] += (1 - tx) * ty
      weights[TERRAIN_INDEX[lookup(x0 + 1, y0 + 1)]] += tx * ty

      let r = 0
      let g = 0
      let b = 0
      let mottle = 0
      let strongest = 0
      for (let t = 0; t < 5; t += 1) {
        const weight = weights[t]
        if (weight === 0) continue
        r += colors[t][0] * weight
        g += colors[t][1] * weight
        b += colors[t][2] * weight
        mottle += TERRAIN_MOTTLE[t] * weight
        if (weight > strongest) strongest = weight
      }

      const patches = fbm(wx * 0.35, wy * 0.35, 5, 2)
      const leafy = fbm(wx * 2.6, wy * 2.6, 31, 2)
      const strokes = valueNoise(wx * 11, wy * 2.4, 9)
      const grain = hash01(i, j, 7)
      let light = 0.9 + 0.2 * patches
      light *= 1 + (leafy - 0.5) * mottle * 2
      light *= 1 + (strokes - 0.5) * 0.07
      light *= 1 + (grain - 0.5) * 0.05

      const edge = 1 - smoothstep(0.52, 0.66, strongest)
      const coast = weights[4] > 0.05 && weights[4] < 0.95 ? 1 : 0
      const ink = edge * (coast ? 0.34 : 0.2)

      const offset = (j * width + i) * 4
      data[offset] = (r * light) * (1 - ink) + INK[0] * ink
      data[offset + 1] = (g * light) * (1 - ink) + INK[1] * ink
      data[offset + 2] = (b * light) * (1 - ink) + INK[2] * ink
      data[offset + 3] = 255
    }
  }
  return { width, height, data }
}

/* ------------------------------------------------------------------ */
/* Dekoration: Bäume, Hügel, Schilf, Steine …                          */
/* ------------------------------------------------------------------ */

export type DecorKind = 'oak' | 'pine' | 'bush' | 'tuft' | 'flower' | 'rock' | 'hill' | 'reed' | 'puddle'

export type Decor = {
  kind: DecorKind
  /** Weltposition in Feldeinheiten. */
  wx: number
  wy: number
  /** Größenfaktor um 1. */
  scale: number
  /** Ganzzahlige Variante (Form, Blütenfarbe …), stabil je Position. */
  variant: number
  /** Helligkeits-/Farbvariation in [0, 1). */
  shade: number
  /** Startwert für den lokalen Zufallsgenerator des Malers. */
  seed: number
}

type Recipe = { kind: DecorKind | 'tree'; min: number; max: number; chance: number }

const DECOR_RECIPES: Record<Terrain, Recipe[]> = {
  plains: [
    { kind: 'tuft', min: 3, max: 5, chance: 1 },
    { kind: 'flower', min: 1, max: 2, chance: 0.5 },
    { kind: 'bush', min: 1, max: 1, chance: 0.22 },
    { kind: 'rock', min: 1, max: 1, chance: 0.1 },
    { kind: 'tree', min: 1, max: 1, chance: 0.14 },
  ],
  forest: [
    { kind: 'tree', min: 2, max: 4, chance: 1 },
    { kind: 'bush', min: 1, max: 2, chance: 0.6 },
    { kind: 'tuft', min: 1, max: 2, chance: 0.7 },
  ],
  hills: [
    { kind: 'hill', min: 1, max: 2, chance: 1 },
    { kind: 'rock', min: 1, max: 2, chance: 0.7 },
    { kind: 'tuft', min: 1, max: 2, chance: 0.8 },
    { kind: 'tree', min: 1, max: 1, chance: 0.1 },
  ],
  marsh: [
    { kind: 'reed', min: 3, max: 5, chance: 1 },
    { kind: 'puddle', min: 1, max: 2, chance: 0.9 },
    { kind: 'tuft', min: 1, max: 1, chance: 0.6 },
    { kind: 'bush', min: 1, max: 1, chance: 0.1 },
  ],
}

const DECOR_SALT = 4001

/** Dekoration eines Felds. Hängt nur von (x, y, Gelände) ab. Dorffelder bleiben frei. */
export function decorForTile(tile: Pick<WorldTile, 'x' | 'y' | 'terrain' | 'village_id'>): Decor[] {
  if (tile.village_id) return []
  const recipes = DECOR_RECIPES[tile.terrain]
  if (!recipes) return []
  const result: Decor[] = []
  // Nadel- und Laubwald bilden großflächige Bestände (Rauschen über Weltkoordinaten).
  const coniferZone = fbm(tile.x * 0.12, tile.y * 0.12, 77, 2) > 0.5

  recipes.forEach((recipe, recipeIndex) => {
    if (hash01(tile.x, tile.y, DECOR_SALT + 200 + recipeIndex) >= recipe.chance) return
    const span = recipe.max - recipe.min
    const count = recipe.min + Math.round(span * hash01(tile.x, tile.y, DECOR_SALT + 100 + recipeIndex))
    for (let index = 0; index < count; index += 1) {
      const salt = DECOR_SALT + 300 + recipeIndex * 20 + index
      let kind: DecorKind
      if (recipe.kind === 'tree') {
        const flip = hash01(tile.x, tile.y, salt + 9) < 0.18
        kind = coniferZone !== flip ? 'pine' : 'oak'
      } else {
        kind = recipe.kind
      }
      result.push({
        kind,
        wx: tile.x + (hash01(tile.x, tile.y, salt + 1) - 0.5) * 0.92,
        wy: tile.y + (hash01(tile.x, tile.y, salt + 2) - 0.5) * 0.92,
        scale: 0.85 + hash01(tile.x, tile.y, salt + 3) * 0.3,
        variant: hashInt(tile.x, tile.y, salt + 4) % 8,
        shade: hash01(tile.x, tile.y, salt + 5),
        seed: hashInt(tile.x, tile.y, salt + 6),
      })
    }
  })
  return result
}

/* ------------------------------------------------------------------ */
/* Dörfer                                                              */
/* ------------------------------------------------------------------ */

export type VillageKind = 'own' | 'allied' | 'player' | 'barbarian'

/** Gleiche Einteilung wie die klassische Karte. */
export function villageKind(
  tile: Pick<WorldTile, 'village_id' | 'is_barbarian' | 'alliance_tag'>,
  ownVillageIds: readonly string[],
  ownAllianceTag: string | null,
): VillageKind | null {
  if (!tile.village_id) return null
  if (ownVillageIds.includes(tile.village_id)) return 'own'
  if (tile.is_barbarian) return 'barbarian'
  if (tile.alliance_tag && tile.alliance_tag === ownAllianceTag) return 'allied'
  return 'player'
}

export type VillageTier = 1 | 2 | 3

export function villageTier(points: number | null): VillageTier {
  const value = points ?? 0
  if (value >= 300) return 3
  if (value >= 150) return 2
  return 1
}

export type VillageHouse = { dx: number; dy: number; width: number; height: number; roof: number }
export type VillageLayout = { houses: VillageHouse[]; keep: { dx: number; dy: number } | null }

const VILLAGE_SALT = 9001

/** Hausanordnung eines Dorfs, stabil je Weltkoordinate. Wächst mit den Dorfpunkten. */
export function layoutVillage(x: number, y: number, tier: VillageTier): VillageLayout {
  const count = tier === 1 ? 3 : tier === 2 ? 5 : 7
  const houses: VillageHouse[] = []
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + hash01(x, y, VILLAGE_SALT) * Math.PI
    const reach = 0.2 + hash01(x, y, VILLAGE_SALT + 10 + index) * 0.2
    houses.push({
      dx: Math.cos(angle) * reach * 1.25,
      dy: Math.sin(angle) * reach * 0.7,
      width: 0.24 + hash01(x, y, VILLAGE_SALT + 30 + index) * 0.08,
      height: 0.17 + hash01(x, y, VILLAGE_SALT + 50 + index) * 0.05,
      roof: hashInt(x, y, VILLAGE_SALT + 70 + index) % 3,
    })
  }
  // Hinten (Norden) zuerst zeichnen: größeres dy = weiter oben.
  houses.sort((a, b) => b.dy - a.dy)
  const keep = tier >= 2 ? { dx: (hash01(x, y, VILLAGE_SALT + 90) - 0.5) * 0.18, dy: 0.1 } : null
  return { houses, keep }
}

/** Ein zeichenbares Element der Ebene, sortiert von Nord nach Süd. */
export type SceneItem =
  | { type: 'decor'; wy: number; decor: Decor }
  | { type: 'village'; wy: number; tile: WorldTile; kind: VillageKind }

/** Baut die sortierte Zeichenliste aus den echten Kartendaten. */
export function buildScene(
  tiles: readonly WorldTile[],
  ownVillageIds: readonly string[],
  ownAllianceTag: string | null,
): SceneItem[] {
  const items: SceneItem[] = []
  for (const tile of tiles) {
    const kind = villageKind(tile, ownVillageIds, ownAllianceTag)
    if (kind) {
      items.push({ type: 'village', wy: tile.y - 0.12, tile, kind })
      continue
    }
    for (const decor of decorForTile(tile)) items.push({ type: 'decor', wy: decor.wy, decor })
  }
  // Nord (größeres y) zuerst; Gleichstand deterministisch über x.
  items.sort((a, b) => b.wy - a.wy || sceneX(a) - sceneX(b))
  return items
}

function sceneX(item: SceneItem) {
  return item.type === 'decor' ? item.decor.wx : item.tile.x
}
