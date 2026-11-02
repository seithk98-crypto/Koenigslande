import { useEffect, useState } from 'react'
import { SessionContext, type Session } from './SessionContext'
import './AuthGate.css'

type Props = {
  children: React.ReactNode
}

const STORAGE_KEY = 'koenigslande-session-v1'

export default function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [registerMode, setRegisterMode] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Session
        setSession(parsed)
      }
    } catch {
      setMessage('Sitzung konnte nicht geladen werden.')
    }

    setLoading(false)
  }, [])

  function saveSession(nextSession: Session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession))
    setSession(nextSession)
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    const cleanEmail = email.trim()
    const cleanName = displayName.trim()

    if (!cleanEmail || !password.trim()) {
      setMessage('E-Mail und Passwort sind erforderlich.')
      setBusy(false)
      return
    }

    if (registerMode && cleanName.length < 3) {
      setMessage('Der Spielername muss mindestens 3 Zeichen lang sein.')
      setBusy(false)
      return
    }

    const nextSession: Session = {
      email: cleanEmail,
      displayName: registerMode ? cleanName : cleanName || 'Herrscher',
    }

    saveSession(nextSession)
    setBusy(false)
    setMessage(registerMode ? 'Konto lokal angelegt. Willkommen im Reich.' : 'Erfolgreich angemeldet.')
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY)
    setSession(null)
    setMessage('Abmeldung erfolgreich.')
  }

  if (loading) {
    return <div className="auth-screen">Kronenreich wird geladen ...</div>
  }

  if (session) {
    return (
      <SessionContext.Provider value={session}>
        <div className="account-bar">
          <span>
            Profil: <strong>{session.displayName}</strong>
          </span>
          <button onClick={handleLogout}>Abmelden</button>
        </div>
        {children}
      </SessionContext.Provider>
    )
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <div className="auth-crown">♛</div>
        <h1>KRONENREICH</h1>
        <p className="auth-subtitle">Dein Reich wartet auf dich.</p>

        <h2>{registerMode ? 'Konto erstellen' : 'Anmelden'}</h2>

        <form onSubmit={handleSubmit}>
          {registerMode && (
            <label>
              Spielername
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                minLength={3}
                maxLength={20}
                required
                placeholder="Dein Name"
              />
            </label>
          )}

          <label>
            E-Mail-Adresse
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder="name@beispiel.de"
            />
          </label>

          <label>
            Passwort
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              required
              placeholder="Mindestens 6 Zeichen"
            />
          </label>

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? 'Bitte warten ...' : registerMode ? 'Kostenlos registrieren' : 'Einloggen'}
          </button>
        </form>

        {message && <p className="auth-message">{message}</p>}

        <button
          className="auth-switch"
          type="button"
          onClick={() => {
            setRegisterMode((current) => !current)
            setMessage('')
          }}
        >
          {registerMode ? 'Bereits Spieler? Anmelden' : 'Noch kein Konto? Jetzt registrieren'}
        </button>
      </section>
    </main>
  )
}
