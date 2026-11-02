import type { Session } from '@supabase/supabase-js'
import GameApp from './GameApp'
import './App.css'

export default function App({ session }: { session: Session }) {
  return <GameApp session={session} />
}
