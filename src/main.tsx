import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './game.css'
import App from './App.tsx'
import AuthGate from './AuthGate.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>{(session) => <App session={session} />}</AuthGate>
  </StrictMode>,
)
