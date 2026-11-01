
import { useEffect, useState } from 'react';
import type { ReactNode, FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import './AuthGate.css';

type Props = {
  children: ReactNode;
};

export default function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [registerMode, setRegisterMode] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setMessage(error.message);
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);

      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
        setForgotMode(false);
        setRegisterMode(false);
        setMessage('Bitte lege jetzt dein neues Passwort fest.');
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setBusy(true);

    try {
      if (recoveryMode) {
        const { error } = await supabase.auth.updateUser({
          password,
        });

        if (error) throw error;

        setRecoveryMode(false);
        setPassword('');
        setMessage('Dein Passwort wurde erfolgreich geändert!');
      } else if (forgotMode) {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: `${window.location.origin}/`,
          }
        );

        if (error) throw error;

        setMessage(
          'Wir haben dir eine E-Mail zum Zurücksetzen deines Passworts geschickt. Bitte prüfe dein Postfach.'
        );
      } else if (registerMode) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: displayName.trim(),
            },
          },
        });

        if (error) throw error;

        if (!data.session) {
          setMessage(
            'Registrierung erfolgreich! Bitte bestätige deine E-Mail-Adresse über den Link in deinem Postfach.'
          );
        } else {
          setMessage('Dein Konto wurde erstellt.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Es ist ein unbekannter Fehler aufgetreten.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) setMessage(error.message);
  }

  if (loading) {
    return <div className="auth-screen">Kronenreich wird geladen ...</div>;
  }

  if (recoveryMode) {
    return (
      <main className="auth-screen">
        <section className="auth-panel">
          <div className="auth-crown">♛</div>
          <h1>KRONENREICH</h1>
          <p className="auth-subtitle">Ein neues Passwort für dein Reich.</p>
          <h2>Passwort ändern</h2>

          <form onSubmit={handleSubmit}>
            <label>
              Neues Passwort
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
              {busy ? 'Bitte warten ...' : 'Neues Passwort speichern'}
            </button>
          </form>

          {message && <p className="auth-message">{message}</p>}
        </section>
      </main>
    );
  }

  if (session) {
    return (
      <>
        <div className="account-bar">
          <span>
            Angemeldet: <strong>{session.user.email}</strong>
          </span>
          <button onClick={handleLogout}>Abmelden</button>
        </div>
        {children}
      </>
    );
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <div className="auth-crown">♛</div>
        <h1>KRONENREICH</h1>
        <p className="auth-subtitle">Dein Reich wartet auf dich.</p>

        <h2>
          {forgotMode
            ? 'Passwort zurücksetzen'
            : registerMode
              ? 'Konto erstellen'
              : 'Anmelden'}
        </h2>

        <form onSubmit={handleSubmit}>
          {registerMode && !forgotMode && (
            <label>
              Spielername
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                minLength={3}
                maxLength={20}
                required
                placeholder="Dein Name im Königreich"
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

          {!forgotMode && (
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
          )}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy
              ? 'Bitte warten ...'
              : forgotMode
                ? 'Reset-E-Mail anfordern'
                : registerMode
                  ? 'Kostenlos registrieren'
                  : 'Einloggen'}
          </button>
        </form>

        {message && <p className="auth-message">{message}</p>}

        {!registerMode && !forgotMode && (
          <button
            className="auth-switch"
            type="button"
            onClick={() => {
              setForgotMode(true);
              setMessage('');
              setPassword('');
            }}
          >
            Passwort vergessen?
          </button>
        )}

        <button
          className="auth-switch"
          type="button"
          onClick={() => {
            setRegisterMode(!registerMode);
            setForgotMode(false);
            setMessage('');
            setPassword('');
          }}
        >
          {registerMode
            ? 'Du hast schon ein Konto? Anmelden'
            : 'Noch kein Konto? Jetzt registrieren'}
        </button>

        {forgotMode && (
          <button
            className="auth-switch"
            type="button"
            onClick={() => {
              setForgotMode(false);
              setMessage('');
            }}
          >
            Zurück zur Anmeldung
          </button>
        )}
      </section>
    </main>
  );
}
