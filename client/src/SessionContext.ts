import { createContext } from 'react'

export type Session = {
  email: string
  displayName: string
}

export const SessionContext = createContext<Session | null>(null)