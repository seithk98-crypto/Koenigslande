/**
 * Canvas-Maler der Landschaftskarte.
 *
 * Zeichnet den Boden (weich verlaufende Geländeflächen), Dekoration und Dörfer
 * für genau den Ausschnitt, den `get_world_map` geliefert hat. Alle Formen sind
 * handgezeichnet wirkende Vektorpfade mit Tuschekontur; wo ein Sprite-Atlas aktiv
 * ist (siehe spriteAtlas.ts), werden stattdessen dessen Sprites verwendet.
 */
import type { WorldTile } from '../types.ts'
import {
  WORLD_MAX, WORLD_MIN, boardGeometry, boardScales, buildScene, createTerrainLookup, layoutVillage,
  renderGround, villageTier, worldToBoard,
  type BoardGeometry, type Decor, type Rgb, type VillageKind,
} from './landscapeScene.ts'
import { hash01, seededRandom } from './mapNoise.ts'
import { pickSprite, type SpriteAtlas } from './spriteAtlas.ts'

export type PaintInput = {
  tiles: readonly WorldTile[]
  center: { x: number; y: number }
  radius: number
  ownVillageIds: readonly string[]
  ownAllianceTag: string | null
  atlas: SpriteAtlas | null
}

const INK = 'rgba(40, 31, 20, 0.62)'

function clamp255(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function css(color: Rgb, multiplier = 1, alpha = 1) {
  const [r, g, b] = color
  return `rgba(${clamp255(r * multiplier)}, ${clamp255(g * multiplier)}, ${clamp255(b * multiplier)}, ${alpha})`
}

function lerp(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function lineWidth(unit: number) {
  return Math.max(0.8, unit * 0.026)
}

/* ------------------------------------------------------------------ */
/* Einstiegspunkt                                                      */
/* ------------------------------------------------------------------ */

/** Zeichnet die komplette Landschaft; gibt die Feldgröße in Canvas-Pixeln zurück. */
export function paintLandscape(canvas: HTMLCanvasElement, input: PaintInput) {
  const geo = boardGeometry(input.center, input.radius)
  const { tilePx, groundPxPerTile } = boardScales(geo.size)
  canvas.width = geo.size * tilePx
  canvas.height = geo.size * tilePx
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas wird von diesem Browser nicht unterstützt.')

  const lookup = createTerrainLookup(input.tiles)
  const ground = renderGround(geo, groundPxPerTile, lookup)
  const groundCanvas = document.createElement('canvas')
  groundCanvas.width = ground.width
  groundCanvas.height = ground.height
  const groundContext = groundCanvas.getContext('2d')
  if (!groundContext) throw new Error('Canvas wird von diesem Browser nicht unterstützt.')
  groundContext.putImageData(new ImageData(ground.data, ground.width, ground.height), 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(groundCanvas, 0, 0, canvas.width, canvas.height)

  paintSeaMarks(ctx, geo, tilePx)
  paintGrid(ctx, geo, tilePx)

  for (const item of buildScene(input.tiles, input.ownVillageIds, input.ownAllianceTag)) {
    if (item.type === 'decor') {
      const { px, py } = worldToBoard(geo, item.decor.wx, item.decor.wy, tilePx)
      paintDecor(ctx, item.decor, px, py, tilePx, input.atlas)
    } else {
      const { px, py } = worldToBoard(geo, item.tile.x, item.tile.y, tilePx)
      paintVillage(ctx, item.tile, item.kind, px, py, tilePx)
    }
  }

  paintVignette(ctx, canvas.width, canvas.height)
  return { tilePx }
}

/* ------------------------------------------------------------------ */
/* Rahmenelemente                                                      */
/* ------------------------------------------------------------------ */

function paintSeaMarks(ctx: CanvasRenderingContext2D, geo: BoardGeometry, tilePx: number) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(238, 246, 248, 0.5)'
  ctx.lineWidth = lineWidth(tilePx) * 1.3
  for (let row = 0; row < geo.size; row += 1) {
    for (let column = 0; column < geo.size; column += 1) {
      const x = geo.originX + column
      const y = geo.topY - row
      if (x >= WORLD_MIN && x <= WORLD_MAX && y >= WORLD_MIN && y <= WORLD_MAX) continue
      if (hash01(x, y, 55) > 0.55) continue
      const cx = (column + 0.2 + hash01(x, y, 56) * 0.6) * tilePx
      const cy = (row + 0.2 + hash01(x, y, 57) * 0.6) * tilePx
      ctx.beginPath()
      ctx.arc(cx, cy, tilePx * 0.16, Math.PI * 1.1, Math.PI * 1.9)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx + tilePx * 0.2, cy + tilePx * 0.07, tilePx * 0.1, Math.PI * 1.1, Math.PI * 1.9)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/** Sehr feines Orientierungsraster: eine gestrichelte Linie je 10 Felder. */
function paintGrid(ctx: CanvasRenderingContext2D, geo: BoardGeometry, tilePx: number) {
  ctx.save()
  ctx.strokeStyle = 'rgba(52, 40, 24, 0.14)'
  ctx.lineWidth = 1
  ctx.setLineDash([tilePx * 0.22, tilePx * 0.3])
  for (let index = 0; index <= geo.size; index += 1) {
    const x = geo.originX - 0.5 + index
    if (Math.round(x + 0.5) % 10 === 0 && Number.isInteger(x + 0.5)) {
      ctx.beginPath()
      ctx.moveTo(index * tilePx, 0)
      ctx.lineTo(index * tilePx, geo.size * tilePx)
      ctx.stroke()
    }
    const y = geo.topY + 0.5 - index
    if (Math.round(y - 0.5) % 10 === 0 && Number.isInteger(y - 0.5)) {
      ctx.beginPath()
      ctx.moveTo(0, index * tilePx)
      ctx.lineTo(geo.size * tilePx, index * tilePx)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function paintVignette(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = ctx.createRadialGradient(width / 2, height / 2, width * 0.42, width / 2, height / 2, width * 0.74)
  gradient.addColorStop(0, 'rgba(50, 36, 18, 0)')
  gradient.addColorStop(1, 'rgba(50, 36, 18, 0.3)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
}

/* ------------------------------------------------------------------ */
/* Dekoration                                                          */
/* ------------------------------------------------------------------ */

const LEAF_DARK: Rgb = [72, 108, 58]
const LEAF_LIGHT: Rgb = [108, 146, 72]
const PINE_DARK: Rgb = [46, 84, 62]
const PINE_LIGHT: Rgb = [70, 110, 78]
const HILL_COLOR: Rgb = [178, 150, 98]
const ROCK_COLOR: Rgb = [150, 146, 132]
const FLOWER_COLORS = ['#f4efe2', '#f2d35a', '#e58ba0', '#9db7e8']

function paintDecor(
  ctx: CanvasRenderingContext2D, decor: Decor, px: number, py: number, tilePx: number, atlas: SpriteAtlas | null,
) {
  if (atlas) {
    const frame = pickSprite(atlas.manifest, decor.kind, decor.variant)
    if (frame) {
      const scale = (tilePx / atlas.manifest.tileSize) * decor.scale
      const anchorX = frame.anchorX ?? frame.w / 2
      const anchorY = frame.anchorY ?? frame.h
      ctx.save()
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(atlas.image, frame.x, frame.y, frame.w, frame.h, px - anchorX * scale, py - anchorY * scale, frame.w * scale, frame.h * scale)
      ctx.restore()
      return
    }
  }
  const unit = tilePx * decor.scale
  const random = seededRandom(decor.seed)
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.lineWidth = lineWidth(unit)
  switch (decor.kind) {
    case 'oak': paintOak(ctx, px, py, unit, decor.shade, random); break
    case 'pine': paintPine(ctx, px, py, unit, decor.shade, random); break
    case 'bush': paintBush(ctx, px, py, unit, decor.shade, random); break
    case 'tuft': paintTuft(ctx, px, py, unit, decor.shade, random); break
    case 'flower': paintFlower(ctx, px, py, unit, decor.variant, random); break
    case 'rock': paintRock(ctx, px, py, unit, decor.shade, random); break
    case 'hill': paintHill(ctx, px, py, unit, decor.shade, random); break
    case 'reed': paintReed(ctx, px, py, unit, decor.shade, random); break
    case 'puddle': paintPuddle(ctx, px, py, unit, random); break
  }
  ctx.restore()
}

function shadow(ctx: CanvasRenderingContext2D, px: number, py: number, rx: number, ry: number) {
  ctx.fillStyle = 'rgba(28, 34, 16, 0.26)'
  ctx.beginPath()
  ctx.ellipse(px + rx * 0.15, py + ry * 0.2, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
}

function paintOak(ctx: CanvasRenderingContext2D, px: number, py: number, u: number, shade: number, random: () => number) {
  const leaf = lerp(LEAF_DARK, LEAF_LIGHT, shade)
  shadow(ctx, px, py, u * 0.3, u * 0.09)
  ctx.fillStyle = '#5b4631'
  ctx.strokeStyle = INK
  ctx.beginPath()
  ctx.rect(px - u * 0.035, py - u * 0.24, u * 0.07, u * 0.24)
  ctx.fill()
  ctx.stroke()

  const lobes = [
    { x: -0.13, y: -0.36, r: 0.19 }, { x: 0.13, y: -0.37, r: 0.19 }, { x: 0, y: -0.5, r: 0.21 },
  ].map((lobe) => ({
    x: px + (lobe.x + (random() - 0.5) * 0.04) * u,
    y: py + (lobe.y + (random() - 0.5) * 0.04) * u,
    r: lobe.r * u * (0.92 + random() * 0.16),
  }))
  ctx.fillStyle = css(leaf, 0.74)
  for (const lobe of lobes) {
    ctx.beginPath()
    ctx.arc(lobe.x, lobe.y, lobe.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  // Licht von links oben.
  ctx.fillStyle = css(leaf, 1.12)
  for (const lobe of lobes) {
    ctx.beginPath()
    ctx.arc(lobe.x - lobe.r * 0.22, lobe.y - lobe.r * 0.24, lobe.r * 0.68, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = css(leaf, 1.3, 0.8)
  for (let dab = 0; dab < 4; dab += 1) {
    ctx.beginPath()
    ctx.arc(px + (random() - 0.6) * u * 0.34, py - (0.34 + random() * 0.26) * u, Math.max(0.8, u * 0.025), 0, Math.PI * 2)
    ctx.fill()
  }
}

function paintPine(ctx: CanvasRenderingContext2D, px: number, py: number, u: number, shade: number, random: () => number) {
  const needles = lerp(PINE_DARK, PINE_LIGHT, shade)
  shadow(ctx, px, py, u * 0.24, u * 0.08)
  ctx.fillStyle = '#58412d'
  ctx.strokeStyle = INK
  ctx.fillRect(px - u * 0.03, py - u * 0.14, u * 0.06, u * 0.14)

  const tiers = 3
  for (let tier = 0; tier < tiers; tier += 1) {
    const baseY = py - u * (0.1 + tier * 0.2)
    const half = u * (0.25 - tier * 0.05) * (0.94 + random() * 0.12)
    const tipY = baseY - u * 0.3
    ctx.beginPath()
    ctx.moveTo(px - half, baseY)
    ctx.lineTo(px - half * 0.35, baseY - u * 0.04)
    ctx.lineTo(px, baseY - u * 0.07)
    ctx.lineTo(px + half * 0.35, baseY - u * 0.04)
    ctx.lineTo(px + half, baseY)
    ctx.lineTo(px, tipY)
    ctx.closePath()
    ctx.fillStyle = css(needles, 0.78)
    ctx.fill()
    ctx.stroke()
    // helle linke Hälfte
    ctx.beginPath()
    ctx.moveTo(px - half * 0.92, baseY - u * 0.01)
    ctx.lineTo(px, tipY + u * 0.02)
    ctx.lineTo(px - half * 0.12, baseY - u * 0.06)
    ctx.closePath()
    ctx.fillStyle = css(needles, 1.18, 0.85)
    ctx.fill()
  }
}

function paintBush(ctx: CanvasRenderingContext2D, px: number, py: number, u: number, shade: number, random: () => number) {
  const leaf = lerp(LEAF_DARK, LEAF_LIGHT, shade)
  shadow(ctx, px, py, u * 0.2, u * 0.06)
  ctx.strokeStyle = INK
  const blobs = [-0.08, 0.07, 0].map((offset, index) => ({
    x: px + offset * u + (random() - 0.5) * 0.03 * u,
    y: py - (index === 2 ? 0.13 : 0.07) * u,
    r: (index === 2 ? 0.11 : 0.1) * u * (0.9 + random() * 0.2),
  }))
  for (const blob of blobs) {
    ctx.fillStyle = css(leaf, 0.82)
    ctx.beginPath()
    ctx.arc(blob.x, blob.y, blob.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.fillStyle = css(leaf, 1.15)
  ctx.beginPath()
  ctx.arc(px - u * 0.03, py - u * 0.15, u * 0.055, 0, Math.PI * 2)
  ctx.fill()
}

function paintTuft(ctx: CanvasRenderingContext2D, px: number, py: number, u: number, shade: number, random: () => number) {
  const blade = lerp([84, 112, 56], [118, 148, 70], shade)
  ctx.strokeStyle = css(blade, 0.85)
  ctx.lineWidth = Math.max(1, u * 0.032)
  const blades = 4
  for (let index = 0; index < blades; index += 1) {
    const startX = px + (index - (blades - 1) / 2) * u * 0.03
    const lean = (index - (blades - 1) / 2) * u * 0.035 + (random() - 0.5) * u * 0.02
    ctx.beginPath()
    ctx.moveTo(startX, py)
    ctx.quadraticCurveTo(startX + lean * 0.4, py - u * 0.07, startX + lean, py - u * (0.1 + random() * 0.05))
    ctx.stroke()
  }
}

function paintFlower(ctx: CanvasRenderingContext2D, px: number, py: number, u: number, variant: number, random: () => number) {
  ctx.strokeStyle = 'rgba(70, 104, 52, 0.9)'
  ctx.lineWidth = Math.max(1, u * 0.026)
  const color = FLOWER_COLORS[variant % FLOWER_COLORS.length]
  for (let index = 0; index < 3; index += 1) {
    const x = px + (index - 1) * u * 0.06 + (random() - 0.5) * u * 0.02
    const top = py - u * (0.08 + random() * 0.05)
    ctx.beginPath()
    ctx.moveTo(x, py)
    ctx.lineTo(x, top)
    ctx.stroke()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, top, Math.max(1.1, u * 0.038), 0, Math.PI * 2)
    ctx.fill()
  }
}

function paintRock(ctx: CanvasRenderingContext2D, px: number, py: number, u: number, shade: number, random: () => number) {
  const stone = lerp(ROCK_COLOR, [176, 170, 152], shade)
  shadow(ctx, px, py, u * 0.17, u * 0.05)
  const points: Array<[number, number]> = []
  const count = 6
  for (let index = 0; index < count; index += 1) {
    const angle = Math.PI + (index / (count - 1)) * Math.PI
    const radius = u * (0.13 + random() * 0.05)
    points.push([px + Math.cos(angle) * radius * 1.2, py + Math.sin(angle) * radius * 0.95])
  }
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (const [x, y] of points.slice(1)) ctx.lineTo(x, y)
  ctx.closePath()
  ctx.fillStyle = css(stone, 0.88)
  ctx.strokeStyle = INK
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = css(stone, 1.3, 0.9)
  ctx.beginPath()
  ctx.moveTo(points[1][0], points[1][1] + u * 0.015)
  ctx.lineTo(points[2][0], points[2][1] + u * 0.015)
  ctx.stroke()
}

function paintHill(ctx: CanvasRenderingContext2D, px: number, py: number, u: number, shade: number, random: () => number) {
  const earth = lerp(HILL_COLOR, [196, 168, 112], shade)
  const half = u * (0.34 + random() * 0.06)
  const height = u * (0.3 + random() * 0.1)
  shadow(ctx, px + half * 0.2, py, half * 0.95, u * 0.06)
  ctx.beginPath()
  ctx.moveTo(px - half, py)
  ctx.bezierCurveTo(px - half * 0.7, py - height * 1.2, px + half * 0.3, py - height * 1.35, px + half, py)
  ctx.closePath()
  ctx.fillStyle = css(earth, 0.9)
  ctx.strokeStyle = INK
  ctx.fill()
  ctx.stroke()
  // Lichtseite links
  ctx.beginPath()
  ctx.moveTo(px - half * 0.88, py - u * 0.01)
  ctx.bezierCurveTo(px - half * 0.62, py - height * 1.05, px - half * 0.1, py - height * 1.18, px + half * 0.05, py - height * 0.9)
  ctx.bezierCurveTo(px - half * 0.15, py - height * 0.45, px - half * 0.45, py - height * 0.2, px - half * 0.88, py - u * 0.01)
  ctx.fillStyle = css(earth, 1.14, 0.85)
  ctx.fill()
  // Schraffur auf der Schattenseite
  ctx.strokeStyle = 'rgba(80, 58, 34, 0.38)'
  ctx.lineWidth = Math.max(0.8, u * 0.018)
  for (let line = 0; line < 4; line += 1) {
    const x = px + half * (0.15 + line * 0.17)
    const y = py - height * (0.85 - line * 0.2)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + half * 0.14, y + height * 0.2)
    ctx.stroke()
  }
}

function paintReed(ctx: CanvasRenderingContext2D, px: number, py: number, u: number, shade: number, random: () => number) {
  const reed = lerp([96, 118, 66], [140, 150, 82], shade)
  ctx.strokeStyle = css(reed, 0.9)
  ctx.lineWidth = Math.max(1, u * 0.03)
  const stems = 5
  for (let index = 0; index < stems; index += 1) {
    const x = px + (index - (stems - 1) / 2) * u * 0.045
    const lean = (index - (stems - 1) / 2) * u * 0.03 + (random() - 0.5) * u * 0.02
    const top = py - u * (0.22 + random() * 0.14)
    ctx.beginPath()
    ctx.moveTo(x, py)
    ctx.quadraticCurveTo(x + lean * 0.3, py - (py - top) * 0.55, x + lean, top)
    ctx.stroke()
    if (index % 2 === 0) {
      ctx.fillStyle = '#6b4a2f'
      ctx.beginPath()
      ctx.ellipse(x + lean, top + u * 0.02, u * 0.017, u * 0.045, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function paintPuddle(ctx: CanvasRenderingContext2D, px: number, py: number, u: number, random: () => number) {
  const rx = u * (0.2 + random() * 0.06)
  const ry = rx * 0.38
  ctx.fillStyle = 'rgba(74, 118, 130, 0.72)'
  ctx.strokeStyle = 'rgba(40, 31, 20, 0.45)'
  ctx.beginPath()
  ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = 'rgba(178, 208, 212, 0.4)'
  ctx.beginPath()
  ctx.ellipse(px - rx * 0.2, py - ry * 0.2, rx * 0.55, ry * 0.45, 0, 0, Math.PI * 2)
  ctx.fill()
}

/* ------------------------------------------------------------------ */
/* Dörfer                                                              */
/* ------------------------------------------------------------------ */

const WALL_PLASTER: Rgb = [228, 212, 172]
const WALL_WOOD: Rgb = [146, 108, 72]
const STONE: Rgb = [170, 166, 150]

const ROOFS: Record<VillageKind, string[]> = {
  own: ['#b5523a', '#a8472f', '#c4623f'],
  allied: ['#6f8f4e', '#5f8048', '#7d9b58'],
  player: ['#6f86a8', '#5f7699', '#7f94b2'],
  barbarian: ['#6b4a38', '#5a3c2e', '#7a5640'],
}

export const BANNER_COLORS: Record<VillageKind, string> = {
  own: '#e8c25a',
  allied: '#93bf66',
  player: '#6f9ed6',
  barbarian: '#c4513f',
}

function paintVillage(
  ctx: CanvasRenderingContext2D, tile: WorldTile, kind: VillageKind, px: number, py: number, tilePx: number,
) {
  const tier = villageTier(tile.points)
  const layout = layoutVillage(tile.x, tile.y, tier)
  const T = Math.max(tilePx * 1.4, 56) // bleibt auch bei weitem Zoom gut erkennbar
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.lineWidth = lineWidth(T)

  // Festgetretener Dorfplatz
  ctx.fillStyle = 'rgba(158, 126, 82, 0.7)'
  ctx.strokeStyle = 'rgba(60, 44, 26, 0.4)'
  ctx.beginPath()
  ctx.ellipse(px, py + T * 0.07, T * 0.62, T * 0.34, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = 'rgba(196, 166, 116, 0.55)'
  ctx.beginPath()
  ctx.ellipse(px - T * 0.04, py + T * 0.03, T * 0.42, T * 0.2, 0, 0, Math.PI * 2)
  ctx.fill()

  if (kind === 'barbarian') paintPalisade(ctx, px, py, T)

  if (layout.keep) paintKeep(ctx, px + layout.keep.dx * T, py - layout.keep.dy * T, T, kind, tier)

  for (const house of layout.houses) {
    paintHouse(ctx, px + house.dx * T, py - house.dy * T + T * 0.1, T, house.width * 1.2, house.height * 1.2, kind, house.roof)
  }

  if (!layout.keep) paintBanner(ctx, px + T * 0.02, py - T * 0.02, T * 0.46, kind)
  ctx.restore()
}

function paintPalisade(ctx: CanvasRenderingContext2D, px: number, py: number, T: number) {
  ctx.strokeStyle = INK
  ctx.fillStyle = 'rgb(122, 88, 56)'
  const stakes = 15
  for (let index = 0; index < stakes; index += 1) {
    const angle = Math.PI * (1.02 + (index / (stakes - 1)) * 0.96)
    const x = px + Math.cos(angle) * T * 0.58
    const y = py + T * 0.02 + Math.sin(angle) * T * 0.3
    const width = T * 0.045
    ctx.beginPath()
    ctx.moveTo(x - width, y + T * 0.05)
    ctx.lineTo(x - width, y - T * 0.08)
    ctx.lineTo(x, y - T * 0.15)
    ctx.lineTo(x + width, y - T * 0.08)
    ctx.lineTo(x + width, y + T * 0.05)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
}

function paintHouse(
  ctx: CanvasRenderingContext2D, x: number, y: number, T: number, width: number, height: number,
  kind: VillageKind, roofIndex: number,
) {
  const w = width * T
  const h = height * T
  ctx.fillStyle = 'rgba(30, 22, 12, 0.24)'
  ctx.beginPath()
  ctx.ellipse(x + w * 0.1, y + h * 0.04, w * 0.62, h * 0.2, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = css(kind === 'barbarian' ? WALL_WOOD : WALL_PLASTER)
  ctx.strokeStyle = INK
  ctx.beginPath()
  ctx.rect(x - w / 2, y - h, w, h)
  ctx.fill()
  ctx.stroke()
  // Schattenseite rechts
  ctx.fillStyle = 'rgba(70, 48, 26, 0.2)'
  ctx.fillRect(x + w * 0.12, y - h, w * 0.38, h)

  const roofHeight = h * 0.95
  const overhang = w * 0.12
  ctx.fillStyle = ROOFS[kind][roofIndex % 3]
  ctx.beginPath()
  ctx.moveTo(x - w / 2 - overhang, y - h + h * 0.04)
  ctx.lineTo(x, y - h - roofHeight)
  ctx.lineTo(x + w / 2 + overhang, y - h + h * 0.04)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = 'rgba(30, 22, 12, 0.3)'
  ctx.beginPath()
  ctx.moveTo(x - w * 0.18, y - h - roofHeight * 0.2)
  ctx.lineTo(x + w * 0.18, y - h - roofHeight * 0.2)
  ctx.moveTo(x - w * 0.32, y - h + roofHeight * 0.08)
  ctx.lineTo(x + w * 0.32, y - h + roofHeight * 0.08)
  ctx.stroke()

  ctx.fillStyle = 'rgba(46, 32, 20, 0.85)'
  ctx.fillRect(x - w * 0.09, y - h * 0.5, w * 0.18, h * 0.5)
}

function paintKeep(
  ctx: CanvasRenderingContext2D, x: number, y: number, T: number, kind: VillageKind, tier: number,
) {
  const w = T * (tier === 3 ? 0.3 : 0.24)
  const h = T * (tier === 3 ? 0.5 : 0.4)
  ctx.fillStyle = 'rgba(30, 22, 12, 0.24)'
  ctx.beginPath()
  ctx.ellipse(x + w * 0.2, y + T * 0.07, w * 0.8, T * 0.06, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = css(kind === 'barbarian' ? [128, 112, 98] : STONE)
  ctx.strokeStyle = INK
  ctx.beginPath()
  ctx.rect(x - w / 2, y + T * 0.06 - h, w, h)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = 'rgba(60, 50, 38, 0.22)'
  ctx.fillRect(x + w * 0.1, y + T * 0.06 - h, w * 0.4, h)
  // Zinnen
  const top = y + T * 0.06 - h
  const merlon = w / 5
  ctx.fillStyle = css(kind === 'barbarian' ? [128, 112, 98] : STONE)
  for (let index = 0; index < 3; index += 1) {
    ctx.beginPath()
    ctx.rect(x - w / 2 + index * merlon * 2, top - T * 0.05, merlon, T * 0.05)
    ctx.fill()
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(40, 30, 20, 0.8)'
  ctx.fillRect(x - w * 0.07, y + T * 0.06 - h * 0.28, w * 0.14, h * 0.28)
  paintBanner(ctx, x, top - T * 0.05, T * 0.34, kind)
}

function paintBanner(ctx: CanvasRenderingContext2D, x: number, baseY: number, height: number, kind: VillageKind) {
  ctx.strokeStyle = INK
  ctx.lineWidth = Math.max(1, height * 0.05)
  ctx.beginPath()
  ctx.moveTo(x, baseY)
  ctx.lineTo(x, baseY - height)
  ctx.stroke()
  ctx.fillStyle = BANNER_COLORS[kind]
  ctx.lineWidth = Math.max(0.8, height * 0.035)
  ctx.beginPath()
  ctx.moveTo(x, baseY - height)
  ctx.lineTo(x + height * 0.5, baseY - height * 0.86)
  ctx.lineTo(x + height * 0.36, baseY - height * 0.74)
  ctx.lineTo(x + height * 0.5, baseY - height * 0.62)
  ctx.lineTo(x, baseY - height * 0.62)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
}
