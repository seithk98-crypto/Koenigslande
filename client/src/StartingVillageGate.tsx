
import { useContext, useEffect, useState } from 'react'
import { SessionContext } from './SessionContext'
import { loadGameState } from './game/persistence'

type Props = {
  children: React.ReactNode
}

export default function StartingVillageGate({ children }: Props) {
  const session = useContext(SessionContext)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      if (!session) throw new Error('Kein lokales Profil aktiv.')
      loadGameState(localStorage, session.email, session.displayName)
      setLoading(false)
    } catch {
      setError('Lokale Spielstände konnten nicht geladen werden.')
      setLoading(false)
    }
  }, [session])

  if (loading) {
    return <div style={{ padding: 40, color: '#e8d5ad' }}>Dein Königreich wird vorbereitet ...</div>
  }

  if (error) {
    return <div style={{ padding: 40, color: '#ff8888' }}>
      <h2>Dein Dorf konnte nicht geladen werden.</h2>
      <p>{error}</p>
    </div>
  }

  return <>{children}</>
}
