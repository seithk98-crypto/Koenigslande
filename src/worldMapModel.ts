export type WorldCenter = { x: number; y: number }

export function getTileGridPosition(x: number, y: number, center: WorldCenter, radius: number) {
  const minX = Math.max(-100, center.x - radius)
  const maxY = Math.min(100, center.y + radius)

  return {
    column: x - minX + 1,
    row: maxY - y + 1,
  }
}
