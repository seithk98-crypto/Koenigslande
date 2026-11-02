import { describe, expect, it } from 'vitest'
import { getTileGridPosition } from './worldMapModel'

describe('world map coordinate placement', () => {
  it('pins tile coordinates to stable grid positions around the origin', () => {
    expect(getTileGridPosition(-10, 10, { x: 0, y: 0 }, 10)).toEqual({ column: 1, row: 1 })
    expect(getTileGridPosition(10, -10, { x: 0, y: 0 }, 10)).toEqual({ column: 21, row: 21 })
  })

  it('keeps negative and positive world edges inside their coordinate slots', () => {
    expect(getTileGridPosition(-100, 100, { x: -100, y: 100 }, 10)).toEqual({ column: 1, row: 1 })
    expect(getTileGridPosition(-90, 90, { x: -100, y: 100 }, 10)).toEqual({ column: 11, row: 11 })
    expect(getTileGridPosition(90, -90, { x: 100, y: -100 }, 10)).toEqual({ column: 1, row: 1 })
    expect(getTileGridPosition(100, -100, { x: 100, y: -100 }, 10)).toEqual({ column: 11, row: 11 })
  })
})
