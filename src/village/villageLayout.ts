import type { BuildingCode } from '../types.ts'

/** Logische Zeichenfläche der Dorfansicht. */
export const SCENE_W = 800
export const SCENE_H = 520

export const BUILDING_ORDER: BuildingCode[] = [
  'rally_point', 'woodcutter', 'iron_mine', 'headquarters', 'clay_pit', 'market',
  'warehouse', 'workshop', 'farm', 'smithy', 'stable', 'barracks',
]

export const BUILDING_LABEL: Record<BuildingCode, string> = {
  headquarters: 'Hauptgebäude', woodcutter: 'Holzfäller', clay_pit: 'Lehmgrube', iron_mine: 'Eisenmine',
  farm: 'Bauernhof', warehouse: 'Speicher', barracks: 'Kaserne', smithy: 'Schmiede', stable: 'Stall',
  workshop: 'Werkstatt', market: 'Marktplatz', rally_point: 'Versammlungsplatz',
}

/** Feste Standorte (Mittelpunkt der Standfläche) in Zeichenflächen-Koordinaten. */
export const BUILDING_SPOT: Record<BuildingCode, { x: number; y: number }> = {
  rally_point: { x: 400, y: 92 },
  woodcutter: { x: 120, y: 130 },
  iron_mine: { x: 690, y: 120 },
  headquarters: { x: 400, y: 250 },
  clay_pit: { x: 120, y: 300 },
  market: { x: 255, y: 235 },
  warehouse: { x: 575, y: 245 },
  workshop: { x: 705, y: 285 },
  farm: { x: 130, y: 430 },
  smithy: { x: 285, y: 400 },
  stable: { x: 500, y: 415 },
  barracks: { x: 665, y: 420 },
}

/** Ausbaustufe → Größenfaktor (Stufe 0 = nur Baugrund). */
export function sizeForLevel(level: number) {
  return 0.72 + Math.min(level, 20) * 0.03
}

/** Baustil nach Stufe: Stroh/Holz, Holz, Stein, Schiefer. */
export function styleForLevel(level: number): 0 | 1 | 2 | 3 {
  if (level >= 15) return 3
  if (level >= 10) return 2
  if (level >= 5) return 1
  return 0
}
