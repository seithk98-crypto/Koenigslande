import { Component, lazy, Suspense, useState, type ComponentProps, type ReactNode } from 'react'
import WorldMap from '../WorldMap.tsx'
import './landscape-switch.css'

const WorldMapCanvas = lazy(() => import('./WorldMapCanvas.tsx'))

type Mode = 'classic' | 'landscape'
type Props = ComponentProps<typeof WorldMap>

const STORAGE_KEY = 'koenigslande.mapMode'

/** Standard bleibt die klassische Karte; die Landschaft muss bewusst gewählt werden. */
function readInitialMode(): Mode {
  try {
    const query = new URLSearchParams(window.location.search).get('karte')
    if (query === 'landschaft') return 'landscape'
    if (query === 'klassisch') return 'classic'
    return window.localStorage.getItem(STORAGE_KEY) === 'landscape' ? 'landscape' : 'classic'
  } catch {
    return 'classic'
  }
}

type BoundaryProps = { fallback: ReactNode; onFail: () => void; children: ReactNode }

/** Fängt Darstellungsfehler der neuen Karte ab und stellt die klassische Karte wieder her. */
class LandscapeBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onFail()
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export default function WorldMapHost(props: Props) {
  const [mode, setMode] = useState<Mode>(readInitialMode)
  const [failed, setFailed] = useState(false)

  function choose(next: Mode) {
    setFailed(false)
    setMode(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Speicher nicht verfügbar: die Auswahl gilt dann nur für diese Sitzung.
    }
  }

  const classic = <WorldMap {...props} />

  return (
    <>
      <div className="map-mode-switch" role="group" aria-label="Kartendarstellung">
        <span>KARTENDARSTELLUNG</span>
        <button type="button" className={mode === 'classic' ? 'selected' : ''} aria-pressed={mode === 'classic'} onClick={() => choose('classic')}>Klassisch</button>
        <button type="button" className={mode === 'landscape' ? 'selected' : ''} aria-pressed={mode === 'landscape'} onClick={() => choose('landscape')}>Landschaft (Prototyp)</button>
        {failed && <em role="alert">Die Landschaftsansicht ist ausgefallen; die klassische Karte wurde wiederhergestellt.</em>}
      </div>
      {mode === 'landscape' && !failed ? (
        <LandscapeBoundary fallback={classic} onFail={() => setFailed(true)}>
          <Suspense fallback={<div className="game-loading"><span>Landschaft wird geladen</span></div>}>
            <WorldMapCanvas {...props} />
          </Suspense>
        </LandscapeBoundary>
      ) : classic}
    </>
  )
}
