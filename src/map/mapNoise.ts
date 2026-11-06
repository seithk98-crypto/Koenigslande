/**
 * Deterministische Hash- und Rauschfunktionen für die Landschaftsdarstellung.
 *
 * Alle Funktionen hängen ausschließlich von ihren Argumenten ab (globale
 * Weltkoordinaten + Salt). Es wird nirgends Math.random() verwendet; dieselbe
 * Koordinate liefert deshalb immer dasselbe Ergebnis, egal welcher Kartenausschnitt
 * gerade geladen ist.
 */

function mix(value: number): number {
  let n = value >>> 0
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d)
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b)
  return (n ^ (n >>> 16)) >>> 0
}

/** Ganzzahl-Hash zweier Koordinaten und eines Salts (32 Bit ohne Vorzeichen). */
export function hashInt(x: number, y: number, salt = 0): number {
  const h = Math.imul(x | 0, 0x1b873593) ^ Math.imul(y | 0, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35)
  return mix(h ^ 0x9e3779b9)
}

/** Gleichverteilter Wert im Bereich [0, 1) für ganzzahlige Koordinaten. */
export function hash01(x: number, y: number, salt = 0): number {
  return hashInt(x, y, salt) / 4294967296
}

/** Kleiner, schneller Zufallsgenerator (mulberry32) für einen festen Startwert. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Value-Noise mit weicher Interpolation; Werte in [0, 1). */
export function valueNoise(x: number, y: number, salt = 0): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const n00 = hash01(x0, y0, salt)
  const n10 = hash01(x0 + 1, y0, salt)
  const n01 = hash01(x0, y0 + 1, salt)
  const n11 = hash01(x0 + 1, y0 + 1, salt)
  const top = n00 + (n10 - n00) * sx
  const bottom = n01 + (n11 - n01) * sx
  return top + (bottom - top) * sy
}

/** Mehrstufiges Rauschen (fraktale Brownsche Bewegung), Werte in etwa [0, 1). */
export function fbm(x: number, y: number, salt = 0, octaves = 3): number {
  let amplitude = 0.5
  let frequency = 1
  let sum = 0
  let norm = 0
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise(x * frequency, y * frequency, salt + octave * 101) * amplitude
    norm += amplitude
    amplitude *= 0.5
    frequency *= 2.03
  }
  return sum / norm
}
