/**
 * Optionaler Sprite-Atlas für Kartendekoration.
 *
 * Liegt unter `public/assets/map/active/` ein `manifest.json` samt Bilddatei, zeichnet
 * der Maler diese Sprites anstelle der eingebauten Handzeichnungen. Fehlt der Atlas
 * (Standard), bleibt die prozedurale Darstellung aktiv. Welche Quelle ein Atlas hat und
 * unter welcher Lizenz sie steht, muss im Manifest und in docs/ASSET_LICENSES.md stehen.
 */
import type { DecorKind } from './landscapeScene.ts'

export type SpriteFrame = {
  x: number
  y: number
  w: number
  h: number
  /** Fußpunkt des Sprites innerhalb des Rahmens (Standard: unten Mitte). */
  anchorX?: number
  anchorY?: number
}

export type SpriteManifest = {
  name: string
  /** Bilddatei relativ zum Manifest. */
  image: string
  /** Quellpixel pro Karten-Feld (z. B. 32 bei einem 32×32-Tileset). */
  tileSize: number
  license: string
  source: string
  sprites: Partial<Record<DecorKind, SpriteFrame[]>>
}

export type SpriteAtlas = { manifest: SpriteManifest; image: CanvasImageSource }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFrame(value: unknown): value is SpriteFrame {
  return isRecord(value)
    && [value.x, value.y, value.w, value.h].every((entry) => typeof entry === 'number' && Number.isFinite(entry))
    && (value.w as number) > 0 && (value.h as number) > 0
}

/** Prüft ein Manifest streng; liefert null, wenn Pflichtangaben (auch Lizenz/Quelle) fehlen. */
export function parseManifest(json: unknown): SpriteManifest | null {
  if (!isRecord(json)) return null
  const { name, image, tileSize, license, source, sprites } = json
  if (typeof name !== 'string' || typeof image !== 'string' || image.includes('..')) return null
  if (typeof tileSize !== 'number' || !(tileSize > 0)) return null
  if (typeof license !== 'string' || !license.trim() || typeof source !== 'string' || !source.trim()) return null
  if (!isRecord(sprites)) return null
  const parsed: SpriteManifest['sprites'] = {}
  for (const [kind, frames] of Object.entries(sprites)) {
    if (!Array.isArray(frames) || frames.length === 0 || !frames.every(isFrame)) return null
    parsed[kind as DecorKind] = frames
  }
  return { name, image, tileSize, license, source, sprites: parsed }
}

/** Wählt eine Variante stabil anhand der Dekorationsvariante. */
export function pickSprite(manifest: SpriteManifest, kind: DecorKind, variant: number): SpriteFrame | null {
  const frames = manifest.sprites[kind]
  if (!frames || frames.length === 0) return null
  return frames[Math.abs(variant) % frames.length]
}

/** Lädt den aktiven Atlas. Fehlt er oder ist er ungültig, wird still `null` geliefert. */
export async function loadSpriteAtlas(baseUrl: string): Promise<SpriteAtlas | null> {
  try {
    const response = await fetch(`${baseUrl}/manifest.json`, { cache: 'no-cache' })
    if (!response.ok) return null
    // Der Vite-Devserver liefert für fehlende Dateien die index.html aus.
    if (!(response.headers.get('content-type') ?? '').includes('json')) return null
    const manifest = parseManifest(await response.json())
    if (!manifest) return null
    const image = new Image()
    image.decoding = 'async'
    image.src = `${baseUrl}/${manifest.image}`
    await image.decode()
    return { manifest, image }
  } catch {
    return null
  }
}
