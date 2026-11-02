import { createInitialGameState, type GameState } from './engine'

export type StorageAdapter = Pick<Storage, 'getItem' | 'setItem'>

export function getGameStorageKey(email: string) {
  return `koenigslande-save-v2:${email.trim().toLowerCase()}`
}

export function loadGameState(storage: StorageAdapter, email: string, playerName: string): GameState {
  try {
    const saved = storage.getItem(getGameStorageKey(email))
    if (saved) return JSON.parse(saved) as GameState
  } catch {
    // Replace an unreadable local save with a fresh one.
  }

  const fresh = createInitialGameState(playerName)
  saveGameState(storage, email, fresh)
  return fresh
}

export function saveGameState(storage: StorageAdapter, email: string, game: GameState) {
  storage.setItem(getGameStorageKey(email), JSON.stringify(game))
}