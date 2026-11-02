import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, Crown, LogOut, Mail, ShieldCheck } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './lib/supabase'

type AuthMode = 'signin' | 'signup'

type AuthGateProps = {
  children: (session: Session) => React.ReactNode
}

export default function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) return

    let active = true
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) setError(sessionError.message)
      setSession(data.session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    setMessage('')

    const result = mode === 'signup'
      ? await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() } },
        })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password })

    setBusy(false)
    if (result.error) {
      setError(result.error.message)
      return
    }

    if (mode === 'signup' && !result.data.session) {
      setMessage('Bitte bestätige deine E-Mail-Adresse. Danach kannst du dich anmelden.')
    }
  }

  if (loading) {
    return <main className="auth-loading"><Crown aria-hidden="true" /><span>Das Reich wird geöffnet</span></main>
  }

  if (!isSupabaseConfigured || !supabase) {
    return (
      <main className="setup-screen">
        <div className="setup-mark"><Crown aria-hidden="true" /></div>
        <p className="eyebrow">KÖNIGSLANDE · ENTWICKLUNG</p>
        <h1>Die Tore sind noch geschlossen.</h1>
        <p>Für echte Anmeldung und gemeinsame Welt fehlen die Supabase-Projektwerte. Lege `.env.local` anhand von `.env.example` an und wende die Migrationen an.</p>
        <div className="setup-check"><ShieldCheck size={18} /> Es werden keine Demo-Konten oder erfundenen Spieldaten verwendet.</div>
      </main>
    )
  }

  if (session) {
    const profileName = session.user.user_metadata.display_name ?? session.user.email ?? 'Herrscher'
    return (
      <>
        <div className="session-bar">
          <span><i /> VERBUNDEN ALS <strong>{profileName}</strong></span>
          <button type="button" onClick={() => void supabase?.auth.signOut()} title="Abmelden"><LogOut size={15} /> Abmelden</button>
        </div>
        {children(session)}
      </>
    )
  }

  return (
    <main className="auth-screen">
      <section className="auth-landscape" aria-label="Königslande">
        <div className="landscape-copy">
          <p className="eyebrow">EIN REICH ENTSTEHT</p>
          <h1>Was du errichtest,<br /><em>bleibt bestehen.</em></h1>
          <p>Ein gemeinsames Land. Ein eigener Anfang. Jede Siedlung hat ihren Platz auf der Karte.</p>
          <div className="landscape-coordinate"><span>WELT I</span><span>201 × 201 FELDER</span><span>SEIT 2026</span></div>
        </div>
        <div className="landscape-sun" aria-hidden="true" />
        <div className="landscape-ridge ridge-back" aria-hidden="true" />
        <div className="landscape-ridge ridge-front" aria-hidden="true" />
      </section>

      <section className="auth-panel">
        <div className="auth-brand"><Crown size={21} strokeWidth={1.6} /><span>KÖNIGSLANDE</span></div>
        <div className="auth-form-wrap">
          <p className="eyebrow">{mode === 'signup' ? 'DEIN NEUES LEBEN' : 'WILLKOMMEN ZURÜCK'}</p>
          <h2>{mode === 'signup' ? 'Siedle dich an.' : 'Kehre zurück.'}</h2>
          <p className="form-intro">{mode === 'signup' ? 'Erstelle dein Konto und gründe dein erstes Dorf.' : 'Melde dich an, um dein Reich fortzuführen.'}</p>

          <div className="auth-switch" role="tablist" aria-label="Anmeldemethode">
            <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'selected' : ''} onClick={() => { setMode('signin'); setError(''); setMessage('') }}>Anmelden</button>
            <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'selected' : ''} onClick={() => { setMode('signup'); setError(''); setMessage('') }}>Konto erstellen</button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <label>
                <span>Spielername</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={3} maxLength={24} required autoComplete="nickname" placeholder="z. B. Alarich" />
              </label>
            )}
            <label>
              <span>E-Mail-Adresse</span>
              <div className="input-with-icon"><Mail size={17} aria-hidden="true" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="name@beispiel.de" /></div>
            </label>
            <label>
              <span>Passwort</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder="Mindestens 8 Zeichen" />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            {message && <p className="form-message" role="status">{message}</p>}
            <button className="submit-button" type="submit" disabled={busy}>
              <span>{busy ? 'Einen Augenblick …' : mode === 'signup' ? 'Konto erstellen' : 'Anmelden'}</span>
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </form>
          <p className="auth-footnote"><ShieldCheck size={15} /> Anmeldung und Spielstände werden von Supabase verwaltet.</p>
        </div>
        <footer className="auth-footer"><span>© 2026 KÖNIGSLANDE</span><span>ALPHA · PHASE A</span></footer>
      </section>
    </main>
  )
}