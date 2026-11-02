import { describe, expect, it } from 'vitest'
import { createInitialGameState, recruitUnits, startBuildingUpgrade, tickResources } from './engine'
import { getGameStorageKey, loadGameState, saveGameState, type StorageAdapter } from './persistence'

describe('game engine', () => {
  it('creates a starting village with production and capacity values', () => {
    const state = createInitialGameState()

    expect(state.villages[0].name).toBe('Mutterdorf')
    expect(state.villages[0].resources.wood).toBeGreaterThan(0)
    expect(state.villages[0].population.capacity).toBeGreaterThan(0)
  })

  it('charges resources and adds a new queue item when upgrading a building', () => {
    const state = createInitialGameState()
    const village = state.villages[0]

    const result = startBuildingUpgrade(state, village.id, 'woodcutter')

    expect(result.ok).toBe(true)
    expect(village.buildingQueue).toHaveLength(1)
    expect(village.resources.wood).toBeLessThan(250)
  })

  it('ticks resources and updates population availability correctly', () => {
    const state = createInitialGameState()
    const village = state.villages[0]

    tickResources(state, 3600)

    expect(village.resources.wood).toBeGreaterThan(150)
    expect(village.population.available).toBeGreaterThanOrEqual(0)
  })

  it('recruits units and reduces free population', () => {
    const state = createInitialGameState()
    const village = state.villages[0]

    const result = recruitUnits(state, village.id, 'spear', 5)

    expect(result.ok).toBe(true)
    expect(village.units.spear).toBeGreaterThan(0)
    expect(village.population.available).toBeLessThan(village.population.capacity)
  })

  it('keeps local saves isolated by profile and initializes the correct player', () => {
    const values = new Map<string, string>()
    const storage: StorageAdapter = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    }

    const firstGame = loadGameState(storage, 'first@example.test', 'Erste')
    firstGame.villages[0].name = 'Burg Erste'
    saveGameState(storage, 'first@example.test', firstGame)

    const secondGame = loadGameState(storage, 'second@example.test', 'Zweite')

    expect(getGameStorageKey('FIRST@example.test')).toBe(getGameStorageKey('first@example.test'))
    expect(secondGame.playerName).toBe('Zweite')
    expect(secondGame.villages[0].name).toBe('Mutterdorf')
    expect(loadGameState(storage, 'first@example.test', 'Erste').villages[0].name).toBe('Burg Erste')
  })
})
