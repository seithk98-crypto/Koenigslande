import type { BuildingCode } from '../types.ts'
import { hash01 } from '../map/mapNoise.ts'
import { BUILDING_SPOT, SCENE_H, SCENE_W, sizeForLevel, styleForLevel } from './villageLayout.ts'

export type VillagePaintInput = {
  levels: Partial<Record<BuildingCode, number>>
  /** Gebäude mit laufendem Bauauftrag. */
  building: ReadonlySet<BuildingCode>
  selected: BuildingCode | null
}

const INK = '#3a2a18'
const WALL = ['#d8c49a', '#c9a878', '#b8b2a2', '#a7a9ad']
const ROOF = ['#c9a64a', '#a4532f', '#7d5a46', '#4f5a6b']

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, stroke = false) {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) ctx.stroke()
}

function paintGround(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, 0, SCENE_H)
  g.addColorStop(0, '#9bb76a')
  g.addColorStop(1, '#7fa05a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, SCENE_W, SCENE_H)
  // Gras und Blumen, deterministisch je Rasterzelle.
  for (let gx = 0; gx < 40; gx += 1) {
    for (let gy = 0; gy < 26; gy += 1) {
      const px = gx * 20 + hash01(gx, gy, 11) * 18
      const py = gy * 20 + hash01(gx, gy, 12) * 18
      ctx.strokeStyle = hash01(gx, gy, 13) > 0.5 ? '#5f8742' : '#6d9a4c'
      ctx.lineWidth = 1.3
      ctx.beginPath()
      ctx.moveTo(px, py); ctx.lineTo(px - 2, py - 5)
      ctx.moveTo(px + 2, py); ctx.lineTo(px + 3, py - 5)
      ctx.stroke()
      if (hash01(gx, gy, 14) > 0.93) ellipse(ctx, px, py - 2, 2, 2, ['#f1d65a', '#e8e4d4', '#e59ab0'][gx % 3])
    }
  }
  // Wege vom Hauptgebäude zu allen Bauplätzen.
  const hq = BUILDING_SPOT.headquarters
  ctx.lineCap = 'round'
  for (const code of Object.keys(BUILDING_SPOT) as BuildingCode[]) {
    if (code === 'headquarters') continue
    const s = BUILDING_SPOT[code]
    ctx.strokeStyle = 'rgba(190, 160, 108, 0.9)'
    ctx.lineWidth = 15
    ctx.beginPath(); ctx.moveTo(hq.x, hq.y + 14); ctx.quadraticCurveTo((hq.x + s.x) / 2, (hq.y + s.y) / 2 + 22, s.x, s.y + 12); ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(214, 188, 140, 0.8)'
  ctx.lineWidth = 7
  for (const code of Object.keys(BUILDING_SPOT) as BuildingCode[]) {
    if (code === 'headquarters') continue
    const s = BUILDING_SPOT[code]
    ctx.beginPath(); ctx.moveTo(hq.x, hq.y + 14); ctx.quadraticCurveTo((hq.x + s.x) / 2, (hq.y + s.y) / 2 + 22, s.x, s.y + 12); ctx.stroke()
  }
}

function tree(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x - 2 * s, y - 8 * s, 4 * s, 9 * s)
  ellipse(ctx, x, y - 16 * s, 11 * s, 11 * s, '#4d8a3a', true)
  ellipse(ctx, x - 3 * s, y - 19 * s, 6 * s, 5 * s, '#6aa84e')
}

function house(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, level: number, extra = 0) {
  const st = styleForLevel(level)
  ellipse(ctx, x, y + 4, w * 0.62, h * 0.22, 'rgba(40,30,10,0.25)')
  ctx.fillStyle = WALL[st]
  ctx.fillRect(x - w / 2, y - h, w, h)
  ctx.strokeRect(x - w / 2, y - h, w, h)
  ctx.fillStyle = ROOF[st]
  ctx.beginPath()
  ctx.moveTo(x - w / 2 - 5, y - h); ctx.lineTo(x, y - h - w * 0.42 - extra); ctx.lineTo(x + w / 2 + 5, y - h); ctx.closePath()
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#5a3d22'; ctx.fillRect(x - w * 0.09, y - h * 0.5, w * 0.18, h * 0.5)
  ctx.fillStyle = '#f3dd96'; ctx.fillRect(x + w * 0.2, y - h * 0.75, w * 0.13, w * 0.13)
}

function flag(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, color: string) {
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h); ctx.stroke()
  ctx.fillStyle = color
  ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + 16, y - h + 5); ctx.lineTo(x, y - h + 11); ctx.closePath(); ctx.fill(); ctx.stroke()
}

function scaffold(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save()
  ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(x - w / 2 - 8, y + 2); ctx.lineTo(x - w / 2 - 8, y - h - 16)
  ctx.moveTo(x + w / 2 + 8, y + 2); ctx.lineTo(x + w / 2 + 8, y - h - 16)
  for (let i = 0; i < 4; i += 1) { ctx.moveTo(x - w / 2 - 8, y - 6 - i * (h / 3)); ctx.lineTo(x + w / 2 + 8, y - 6 - i * (h / 3)) }
  ctx.stroke()
  ctx.restore()
}

function paintOne(ctx: CanvasRenderingContext2D, code: BuildingCode, level: number, constructing: boolean) {
  const { x, y } = BUILDING_SPOT[code]
  const k = sizeForLevel(level)
  if (level === 0) {
    // Leerer Bauplatz: gestrichelter Grundriss.
    ctx.save()
    ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(58,42,24,0.7)'; ctx.lineWidth = 2
    ctx.strokeRect(x - 28, y - 18, 56, 34)
    ctx.restore()
    if (constructing) scaffold(ctx, x, y + 10, 50, 24)
    return
  }
  const bw = 54 * k
  const bh = 34 * k
  switch (code) {
    case 'headquarters': {
      house(ctx, x, y, 90 * k, 52 * k, level, 14)
      ctx.fillStyle = WALL[styleForLevel(level)]; ctx.fillRect(x + 30 * k, y - 84 * k, 22 * k, 50 * k); ctx.strokeRect(x + 30 * k, y - 84 * k, 22 * k, 50 * k)
      flag(ctx, x + 41 * k, y - 84 * k, 26, '#e8c25a')
      break
    }
    case 'woodcutter': {
      house(ctx, x, y, 44 * k, 28 * k, level)
      for (let i = 0; i < 2 + Math.min(4, Math.floor(level / 3)); i += 1) tree(ctx, x - 52 + i * 14, y + 14 - (i % 2) * 10, 0.8)
      ctx.fillStyle = '#8a5d32'; for (let i = 0; i < 3; i += 1) ctx.fillRect(x + 34, y - 6 + i * 6, 22, 5)
      break
    }
    case 'clay_pit': {
      ellipse(ctx, x, y, 52 * k, 24 * k, '#a8643a', true)
      ellipse(ctx, x, y + 2, 38 * k, 15 * k, '#7d4528')
      for (let i = 0; i < Math.min(5, 1 + Math.floor(level / 3)); i += 1) ellipse(ctx, x - 40 + i * 20, y - 24 * k, 9, 6, '#c98a58', true)
      break
    }
    case 'iron_mine': {
      ctx.fillStyle = '#8a8d92'; ctx.beginPath(); ctx.moveTo(x - 62 * k, y + 10); ctx.quadraticCurveTo(x, y - 90 * k, x + 62 * k, y + 10); ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#2a2018'; ctx.fillRect(x - 12, y - 24, 24, 34)
      ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 4; ctx.strokeRect(x - 14, y - 26, 28, 36)
      ctx.lineWidth = 2.5; ctx.strokeStyle = INK
      break
    }
    case 'farm': {
      for (let i = 0; i < 4; i += 1) { ctx.fillStyle = i % 2 ? '#d6b95a' : '#b89a3c'; ctx.fillRect(x - 70, y + 8 + i * 8, 52, 6) }
      house(ctx, x + 20, y, 70 * k, 38 * k, level, 6)
      break
    }
    case 'warehouse': {
      house(ctx, x, y, 84 * k, 34 * k, level)
      ctx.fillStyle = '#9a6e3a'; for (let i = 0; i < Math.min(4, 1 + Math.floor(level / 3)); i += 1) { ctx.fillRect(x - 48 + i * 22, y + 4, 16, 14); ctx.strokeRect(x - 48 + i * 22, y + 4, 16, 14) }
      break
    }
    case 'barracks': {
      house(ctx, x, y, 78 * k, 40 * k, level)
      flag(ctx, x - 38 * k, y - 40 * k, 30, '#b8453a')
      ctx.strokeStyle = '#6b4a2a'; for (let i = 0; i < 6; i += 1) { ctx.beginPath(); ctx.moveTo(x - 44 + i * 18, y + 16); ctx.lineTo(x - 44 + i * 18, y + 4); ctx.stroke() }
      ctx.strokeStyle = INK
      break
    }
    case 'smithy': {
      house(ctx, x, y, bw, bh, level)
      ctx.fillStyle = '#6a5a52'; ctx.fillRect(x + bw / 2 - 12, y - bh - 24, 10, 22)
      ellipse(ctx, x + bw / 2 - 6, y - bh - 32, 9, 7, 'rgba(120,120,120,0.55)')
      ctx.fillStyle = '#4a4a4f'; ctx.fillRect(x - bw / 2 - 16, y - 8, 14, 8)
      break
    }
    case 'stable': {
      house(ctx, x, y, 74 * k, 34 * k, level, 4)
      ctx.strokeStyle = '#6b4a2a'; ctx.beginPath(); ctx.moveTo(x - 60, y + 14); ctx.lineTo(x - 40, y + 14); ctx.moveTo(x - 60, y + 6); ctx.lineTo(x - 40, y + 6); ctx.stroke(); ctx.strokeStyle = INK
      break
    }
    case 'workshop': {
      house(ctx, x, y, 60 * k, 32 * k, level)
      ellipse(ctx, x - 46, y, 11, 11, '#8a5d32', true); ellipse(ctx, x - 46, y, 3, 3, '#3a2a18')
      break
    }
    case 'market': {
      for (let i = 0; i < Math.min(4, 2 + Math.floor(level / 4)); i += 1) {
        const sx = x - 42 + i * 28
        ctx.fillStyle = ['#c9453a', '#e4c24a', '#4d7fb8', '#e8e2d0'][i]
        ctx.beginPath(); ctx.moveTo(sx - 13, y - 22); ctx.lineTo(sx + 13, y - 22); ctx.lineTo(sx + 16, y - 10); ctx.lineTo(sx - 16, y - 10); ctx.closePath(); ctx.fill(); ctx.stroke()
        ctx.fillStyle = '#9a6e3a'; ctx.fillRect(sx - 13, y - 10, 26, 12); ctx.strokeRect(sx - 13, y - 10, 26, 12)
      }
      break
    }
    case 'rally_point': {
      for (let i = 0; i < 9; i += 1) { const a = (i / 9) * Math.PI * 2; ellipse(ctx, x + Math.cos(a) * 34, y + 4 + Math.sin(a) * 15, 6, 4.5, '#a9a8a0', true) }
      flag(ctx, x, y + 6, 20 + Math.min(level, 10) * 2, '#d8d2c0')
      break
    }
  }
  if (constructing) scaffold(ctx, x, y, bw + 10, bh + 8)
}

export function paintVillage(canvas: HTMLCanvasElement, input: VillagePaintInput) {
  const ratio = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = SCENE_W * ratio
  canvas.height = SCENE_H * ratio
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas wird nicht unterstützt')
  ctx.scale(ratio, ratio)
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 2.5; ctx.strokeStyle = INK
  paintGround(ctx)
  // Bäume am Rand, fest verteilt.
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.setLineDash([])
  for (let i = 0; i < 22; i += 1) {
    const x = hash01(i, 1, 77) * SCENE_W; const y = hash01(i, 2, 77) < 0.5 ? 14 + hash01(i, 3, 77) * 26 : SCENE_H - 6 - hash01(i, 3, 77) * 10
    tree(ctx, x, y, 0.9 + hash01(i, 4, 77) * 0.4)
  }
  const order = (Object.keys(BUILDING_SPOT) as BuildingCode[]).sort((a, b) => BUILDING_SPOT[a].y - BUILDING_SPOT[b].y)
  for (const code of order) {
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK
    paintOne(ctx, code, input.levels[code] ?? 0, input.building.has(code))
    if (input.selected === code) {
      const { x, y } = BUILDING_SPOT[code]
      ctx.save(); ctx.setLineDash([8, 5]); ctx.strokeStyle = '#f3dc92'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.ellipse(x, y - 8, 66, 44, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
    }
  }
}
