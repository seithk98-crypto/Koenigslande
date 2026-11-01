
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import './App.css'

type Resources = {
  wood: number
  clay: number
  iron: number
}

type Population = {
  used: number
  capacity: number
  available: number
}

type Requirement = {
  code: string
  name: string
  required_level: number
  current_level: number
}

type Village = {
  id: string
  name: string
  x: number
  y: number
  loyalty: number
  wood: number
  clay: number
  iron: number
}

type Building = {
  code: string
  name: string
  category: string
  level: number
  max_level: number
  next_wood_cost: number | null
  next_clay_cost: number | null
  next_iron_cost: number | null
  next_build_seconds: number | null
  production_per_hour: number
  capacity: number
  requirements: Requirement[]
}

type Construction = {
  id: string
  building_code: string
  target_level: number
  started_at: string
  completes_at: string
  status: string
}

type VillageState = {
  village: Village
  resources: Resources & {
    warehouse_capacity: number
    wood_per_hour: number
    clay_per_hour: number
    iron_per_hour: number
    completed_buildings: number
  }
  buildings: Building[]
  build_queue: Construction[]
}

const buildingDetails: Record<string, { icon: string; description: string }> = {
  headquarters: { icon: '🏰', description: 'Verwaltet dein Dorf und beschleunigt Bauarbeiten.' },
  woodcutter: { icon: '🪓', description: 'Produziert Holz für deine Bauvorhaben.' },
  clay_pit: { icon: '🧱', description: 'Fördert wertvollen Lehm.' },
  iron_mine: { icon: '⛏️', description: 'Fördert Eisen für deine Truppen.' },
  farm: { icon: '🌾', description: 'Versorgt deine Bevölkerung.' },
  warehouse: { icon: '📦', description: 'Lagert deine Rohstoffe.' },
  barracks: { icon: '⚔️', description: 'Rekrutiert deine Infanterie.' },
  rally_point: { icon: '🚩', description: 'Verwaltet deine Truppenbewegungen.' },
  stable: { icon: '🐎', description: 'Ermöglicht die Ausbildung von Kavallerie.' },
  workshop: { icon: '🛠️', description: 'Stellt Belagerungswaffen her.' },
  smithy: { icon: '⚒️', description: 'Erforscht Verbesserungen für deine Truppen.' },
  market: { icon: '🏪', description: 'Ermöglicht den Handel mit anderen Dörfern.' },
  wall: { icon: '🛡️', description: 'Verstärkt die Verteidigung deines Dorfes.' },
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const remaining = safe % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')} Std.`
  }

  return `${minutes}:${String(remaining).padStart(2, '0')} Min.`
}

function formatNumber(value: number) {
  return Math.floor(value).toLocaleString('de-DE')
}

function App() {
  const [game, setGame] = useState<VillageState | null>(null)
  const [population, setPopulation] = useState<Population | null>(null)
  const [now, setNow] = useState(Date.now())
  const [message, setMessage] = useState('Willkommen in deinem Dorf!')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [playerName, setPlayerName] = useState('Neuer Herrscher')

  const loadVillage = useCallback(async () => {
    const [villageResult, populationResult] = await Promise.all([
      supabase.rpc('get_my_village_state'),
      supabase.rpc('get_my_population_state'),
    ])

    if (villageResult.error) {
      setMessage(`Fehler beim Laden: ${villageResult.error.message}`)
      setLoading(false)
      return
    }

    if (!villageResult.data) {
      setMessage('Supabase hat keine Dorfdaten zurückgegeben.')
      setLoading(false)
      return
    }

    setGame(villageResult.data as VillageState)

    if (populationResult.error) {
      setMessage(`Bevölkerung konnte nicht geladen werden: ${populationResult.error.message}`)
    } else if (populationResult.data) {
      setPopulation(populationResult.data as Population)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    loadVillage()

    const clockInterval = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    const refreshInterval = window.setInterval(() => {
      loadVillage()
    }, 15000)

    return () => {
      window.clearInterval(clockInterval)
      window.clearInterval(refreshInterval)
    }
  }, [loadVillage])

  useEffect(() => {
    async function loadPlayer() {
      const { data } = await supabase.auth.getUser()
      const name = data.user?.user_metadata?.display_name

      if (name) setPlayerName(name)
    }

    loadPlayer()
  }, [])

  async function upgradeBuilding(building: Building) {
    if (!game || busy) return

    if (game.build_queue.length > 0) {
      setMessage('Dein Baumeister arbeitet bereits an einem Gebäude!')
      return
    }

    if (building.level >= building.max_level) {
      setMessage(`${building.name} hat bereits die maximale Stufe erreicht.`)
      return
    }

    const missingRequirements = building.requirements.filter(
      requirement => requirement.current_level < requirement.required_level
    )

    if (missingRequirements.length > 0) {
      setMessage('Die Bauvoraussetzungen sind noch nicht erfüllt.')
      return
    }

    setBusy(true)
    setMessage(`Ausbau von ${building.name} wird gestartet ...`)

    const { data, error } = await supabase.rpc(
      'start_building_upgrade',
      { p_building_code: building.code }
    )

    if (error) {
      setMessage(error.message)
      setBusy(false)
      await loadVillage()
      return
    }

    setMessage(`${building.name} auf Stufe ${data.target_level} wird ausgebaut!`)

    await loadVillage()
    setBusy(false)
  }

  async function refreshVillage() {
    setBusy(true)
    await loadVillage()
    setMessage('Dorfdaten wurden aktualisiert.')
    setBusy(false)
  }

  if (loading) {
    return (
      <div className="game">
        <main className="main">
          <h1>🏰 KRONENREICH</h1>
          <p>Dein Königreich wird aus der Datenbank geladen ...</p>
        </main>
      </div>
    )
  }

  if (!game) {
    return (
      <div className="game">
        <main className="main">
          <h1>Dein Dorf konnte nicht geladen werden.</h1>
          <p>{message}</p>
          <button className="upgrade" onClick={loadVillage}>
            Erneut versuchen
          </button>
        </main>
      </div>
    )
  }

  const { village, resources, buildings, build_queue } = game
  const construction = build_queue[0] ?? null

  const populationPercent = population
    ? Math.min(100, (population.used / Math.max(1, population.capacity)) * 100)
    : 0

  const remaining = construction
    ? Math.max(
        0,
        Math.ceil(
          (new Date(construction.completes_at).getTime() - now) / 1000
        )
      )
    : 0

  const totalDuration = construction
    ? Math.max(
        1,
        Math.ceil(
          (new Date(construction.completes_at).getTime() -
            new Date(construction.started_at).getTime()) / 1000
        )
      )
    : 1

  const elapsed = totalDuration - remaining
  const progress = construction
    ? Math.max(0, Math.min(100, (elapsed / totalDuration) * 100))
    : 0

  return (
    <div className="game">
      <header className="topbar">
        <div className="logo">⚔️ <span>KRONENREICH</span></div>
        <div className="player">
          Spieler: <strong>{playerName}</strong>
        </div>
      </header>

      <section className="resources">
        <div>
          🪵 Holz <strong>{formatNumber(resources.wood)}</strong>
          <small>+{resources.wood_per_hour}/Std.</small>
        </div>
        <div>
          🧱 Lehm <strong>{formatNumber(resources.clay)}</strong>
          <small>+{resources.clay_per_hour}/Std.</small>
        </div>
        <div>
          ⛏️ Eisen <strong>{formatNumber(resources.iron)}</strong>
          <small>+{resources.iron_per_hour}/Std.</small>
        </div>
        <div>
          📦 Lager <strong>{formatNumber(resources.warehouse_capacity)}</strong>
        </div>
        <div>
          👥 Bevölkerung
          <strong>
            {population
              ? `${formatNumber(population.used)} / ${formatNumber(population.capacity)}`
              : '–'}
          </strong>
          <small>
            {population
              ? `${formatNumber(population.available)} frei`
              : 'Wird geladen ...'}
          </small>
          <div
            style={{
              height: '7px',
              background: '#333',
              borderRadius: '5px',
              overflow: 'hidden',
              marginTop: '7px',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${populationPercent}%`,
                background: populationPercent >= 90 ? '#c0392b' : '#6b9b50',
                borderRadius: '5px',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      </section>

      <nav className="navigation">
        <button className="active">Dorf</button>
        <button disabled>Karte</button>
        <button disabled>Truppen</button>
        <button disabled>Berichte</button>
        <button disabled>Nachrichten</button>
        <button disabled>Stamm</button>
      </nav>

      <main className="main">
        <div className="welcome">
          <div>
            <p className="eyebrow">DEIN LEHEN</p>
            <h1>{village.name}</h1>
            <p>Ein neues Reich beginnt. Baue dein Dorf aus und sichere deine Macht.</p>
            <p>Koordinaten: ({village.x} | {village.y})</p>
          </div>
          <div className="village-level">
            Dorf <strong>{village.x.toString().padStart(3, '0')}</strong>
          </div>
        </div>

        <div className="game-message">{message}</div>

        <section className="village">
          <div className="village-art">
            <div className="castle">🏰</div>
            <div className="village-label">Dorfzentrum</div>
            <div className="village-buildings">
              <span>🌲</span><span>🏠</span><span>🌾</span>
              <span>⚒️</span><span>🏡</span><span>🛡️</span>
            </div>
          </div>
        </section>

        <div className="section-heading">
          <div>
            <p className="eyebrow">WIRTSCHAFT & MILITÄR</p>
            <h2>Gebäude deines Dorfes</h2>
          </div>
          <span className="building-count">{buildings.length} Gebäude</span>
        </div>

        <section className="building-grid">
          {buildings.map(building => {
            const details = buildingDetails[building.code] ?? {
              icon: '🏗️',
              description: 'Ein Gebäude deines Königreichs.',
            }

            const isBuilding = construction?.building_code === building.code

            const canUpgrade =
              building.level < building.max_level &&
              building.next_wood_cost !== null

            const missingRequirements = building.requirements.filter(
              requirement => requirement.current_level < requirement.required_level
            )

            const requirementsMet = missingRequirements.length === 0

            return (
              <article className="building-card" key={building.code}>
                <div className="building-icon">{details.icon}</div>

                <div className="building-info">
                  <h3>{building.name}</h3>
                  <p>{details.description}</p>

                  <span>Stufe {building.level} / {building.max_level}</span>

                  {canUpgrade ? (
                    <p>
                      Kosten: 🪵 {formatNumber(building.next_wood_cost ?? 0)}
                      {' · '}
                      🧱 {formatNumber(building.next_clay_cost ?? 0)}
                      {' · '}
                      ⛏️ {formatNumber(building.next_iron_cost ?? 0)}
                    </p>
                  ) : (
                    <p>
                      {building.level >= building.max_level
                        ? 'Maximale Stufe erreicht'
                        : 'Noch nicht ausbaubar'}
                    </p>
                  )}

                  {building.production_per_hour > 0 && (
                    <p>
                      Produktion: {building.production_per_hour} Rohstoffe/Stunde
                    </p>
                  )}

                  {building.requirements.length > 0 && (
                    <div className="building-requirements">
                      <strong>Bauvoraussetzungen:</strong>
                      {building.requirements.map(requirement => {
                        const fulfilled =
                          requirement.current_level >= requirement.required_level

                        return (
                          <p key={requirement.code}>
                            {fulfilled ? '✅' : '🔒'} {requirement.name}:{' '}
                            {requirement.current_level} / {requirement.required_level}
                          </p>
                        )
                      })}
                    </div>
                  )}

                  {isBuilding && (
                    <p className="construction-status">
                      Im Ausbau: {formatTime(remaining)}
                    </p>
                  )}
                </div>

                <button
                  className="upgrade"
                  disabled={
                    busy ||
                    Boolean(construction) ||
                    !canUpgrade ||
                    !requirementsMet
                  }
                  onClick={() => upgradeBuilding(building)}
                >
                  {isBuilding
                    ? 'Im Ausbau'
                    : !requirementsMet
                      ? 'Voraussetzungen fehlen'
                      : !canUpgrade
                        ? 'Maximale Stufe'
                        : 'Ausbauen'}
                </button>
              </article>
            )
          })}
        </section>

        <section className="game-controls">
          <h2>Bauwarteschlange</h2>

          {construction ? (
            <>
              <p>
                🔨 {buildings.find(
                  b => b.code === construction.building_code
                )?.name ?? construction.building_code}
                {' – '}Stufe {construction.target_level}
              </p>

              <p>
                Noch benötigte Zeit: <strong>{formatTime(remaining)}</strong>
              </p>

              <div className="construction-bar">
                <div
                  className="construction-progress"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </>
          ) : (
            <p>Aktuell sind keine Gebäude im Ausbau.</p>
          )}

          <button
            className="upgrade"
            onClick={refreshVillage}
            disabled={busy}
          >
            {busy ? 'Bitte warten ...' : 'Dorf aktualisieren'}
          </button>
        </section>
      </main>

      <footer>
        KRONENREICH · Eine Welt. Viele Herrscher. Ein Schicksal.
      </footer>
    </div>
  )
}

export default App
