import { useContext, useEffect, useMemo, useState } from 'react'
import './App.css'
import WorldMap from './WorldMap'
import { SessionContext } from './SessionContext'
import { loadGameState, saveGameState } from './game/persistence'
import { getBuildingName, getBuildingUpgradeCost, getVillageProductionDisplay, recruitUnits, startAttack, startBuildingUpgrade, tickResources, type BuildingCode, type GameState, type UnitCode } from './game/engine'

const BUILDING_CODES: BuildingCode[] = [
  'headquarters',
  'woodcutter',
  'clay_pit',
  'iron_mine',
  'farm',
  'warehouse',
  'barracks',
  'smithy',
  'stable',
  'workshop',
  'market',
  'rally_point',
]
const UNIT_CODES: UnitCode[] = ['spear', 'sword', 'axe', 'archer', 'light_cavalry', 'heavy_cavalry']

const buildingIcons: Record<BuildingCode, string> = {
  headquarters: '🏰',
  woodcutter: '🪓',
  clay_pit: '🧱',
  iron_mine: '⛏️',
  farm: '🌾',
  warehouse: '📦',
  barracks: '⚔️',
  smithy: '⚒️',
  stable: '🐎',
  workshop: '🛠️',
  market: '🏪',
  rally_point: '🚩',
}

const unitIcons: Record<UnitCode, string> = {
  spear: '🗡️',
  sword: '⚔️',
  axe: '🪓',
  archer: '🏹',
  light_cavalry: '🐎',
  heavy_cavalry: '🐴',
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const remaining = safe % 60

  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')} h`
  return `${minutes}:${String(remaining).padStart(2, '0')} min`
}

function App() {
  const session = useContext(SessionContext)
  const [game, setGame] = useState<GameState>(() =>
    loadGameState(localStorage, session?.email ?? 'guest', session?.displayName ?? 'Neues Reich'),
  )
  const [activeTab, setActiveTab] = useState<'village' | 'map' | 'troops'>('village')
  const [selectedVillageId, setSelectedVillageId] = useState<string>('v1')
  const [selectedTargetId, setSelectedTargetId] = useState<string>('barb-1')
  const [message, setMessage] = useState('Willkommen in deinem Reich!')
  const [recruitQuantities, setRecruitQuantities] = useState<Record<UnitCode, number>>({
    spear: 1,
    sword: 1,
    axe: 1,
    archer: 1,
    light_cavalry: 1,
    heavy_cavalry: 1,
  })
  const [attackQuantities, setAttackQuantities] = useState<Record<UnitCode, number>>({
    spear: 0,
    sword: 0,
    axe: 0,
    archer: 0,
    light_cavalry: 0,
    heavy_cavalry: 0,
  })
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (session) saveGameState(localStorage, session.email, game)
  }, [game, session])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now())
      setGame((current) => {
        if (!current) return current
        const clone = JSON.parse(JSON.stringify(current)) as GameState
        tickResources(clone, 1)
        return clone
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!game.villages.some((village) => village.id === selectedVillageId)) {
      setSelectedVillageId(game.villages[0]?.id ?? 'v1')
    }
  }, [game, selectedVillageId])

  const village = useMemo(
    () => game.villages.find((entry) => entry.id === selectedVillageId) ?? game.villages[0],
    [game, selectedVillageId],
  )

  if (!village) {
    return <div className="game"><main className="main"><h1>Kein Dorf gefunden.</h1></main></div>
  }

  const selectedTarget = game.world.find((entry) => entry.id === selectedTargetId) ?? game.world[1]
  const production = getVillageProductionDisplay(village)
  const queueEntry = village.buildingQueue[0]
  const queueSeconds = queueEntry ? Math.max(0, Math.ceil((queueEntry.completesAt - now) / 1000)) : 0

  function handleUpgrade(buildingCode: BuildingCode) {
    const next = JSON.parse(JSON.stringify(game)) as GameState
    const result = startBuildingUpgrade(next, village.id, buildingCode)
    if (!result.ok) {
      setMessage(result.reason ?? 'Ausbau nicht möglich.')
      return
    }

    setGame(next)
    setMessage(`${getBuildingName(buildingCode)} wurde in die Bauwarteschlange gelegt.`)
  }

  function handleRecruit(unitCode: UnitCode) {
    const next = JSON.parse(JSON.stringify(game)) as GameState
    const quantity = Math.max(1, recruitQuantities[unitCode] ?? 1)
    const result = recruitUnits(next, village.id, unitCode, quantity)
    if (!result.ok) {
      setMessage(result.reason ?? 'Rekrutierung fehlgeschlagen.')
      return
    }

    setGame(next)
    setMessage(`${quantity} ${unitCode} wurden rekrutiert.`)
  }

  function handleAttack() {
    const next = JSON.parse(JSON.stringify(game)) as GameState
    const selectedUnits = Object.fromEntries(
      UNIT_CODES.map((code) => [code, attackQuantities[code] ?? 0]),
    ) as Record<UnitCode, number>

    const result = startAttack(next, village.id, selectedTargetId, selectedUnits)
    if (!result.ok) {
      setMessage(result.reason ?? 'Angriff konnte nicht gestartet werden.')
      return
    }

    setGame(next)
    setMessage(`Angriff auf ${selectedTarget.name} gestartet.`)
  }

  return (
    <div className="game">
      <header className="topbar">
        <div className="logo">⚔️ <span>KÖNIGSLANDE</span></div>
        <div className="player">Spieler: <strong>{game.playerName}</strong></div>
      </header>

      <section className="resources">
        <div>🪵 Holz <strong>{Math.floor(village.resources.wood)}</strong><small>+{production.wood}/h</small></div>
        <div>🧱 Lehm <strong>{Math.floor(village.resources.clay)}</strong><small>+{production.clay}/h</small></div>
        <div>⛏️ Eisen <strong>{Math.floor(village.resources.iron)}</strong><small>+{production.iron}/h</small></div>
        <div>🌾 Essen <strong>{Math.floor(village.resources.food)}</strong><small>+{production.food}/h</small></div>
        <div>👥 Bevölkerung <strong>{village.population.used} / {village.population.capacity}</strong><small>{village.population.available} frei</small></div>
      </section>

      <nav className="navigation">
        <button className={activeTab === 'village' ? 'active' : ''} onClick={() => setActiveTab('village')}>Dorf</button>
        <button className={activeTab === 'map' ? 'active' : ''} onClick={() => setActiveTab('map')}>Karte</button>
        <button className={activeTab === 'troops' ? 'active' : ''} onClick={() => setActiveTab('troops')}>Truppen</button>
      </nav>

      <main className="main">
        <div className="welcome">
          <div>
            <p className="eyebrow">DEIN LEHEN</p>
            <h1>{village.name}</h1>
            <p>Koordinaten: ({village.x} | {village.y})</p>
          </div>
          <div className="village-level">Dorf <strong>{String(village.x).padStart(3, '0')}</strong></div>
        </div>

        <div className="game-message">{message}</div>

        {activeTab === 'village' && (
          <>
            <section className="village">
              <div className="village-art">
                <div className="castle">🏰</div>
                <div className="village-label">Dorfzentrum</div>
                <div className="village-buildings">
                  <span>🌲</span><span>🏠</span><span>🌾</span><span>⚒️</span><span>🏡</span><span>🛡️</span>
                </div>
              </div>
            </section>

            <div className="section-heading">
              <div><p className="eyebrow">BAUWERKE</p><h2>Gebäude</h2></div>
              {queueEntry ? <span className="building-count">Bau endet in {formatTime(queueSeconds)}</span> : <span className="building-count">Keine Bauarbeiten</span>}
            </div>

            <div className="building-grid">
              {BUILDING_CODES.map((code) => {
                const level = village.buildings[code]
                const cost = getBuildingUpgradeCost(code, level + 1)
                const canUpgrade = level < 20

                return (
                  <div className="building-card" key={code}>
                    <div className="building-icon">{buildingIcons[code]}</div>
                    <div className="building-meta">
                      <div className="building-title-row">
                        <h3>{getBuildingName(code)}</h3>
                        <span>Stufe {level}</span>
                      </div>
                      <p>Rohstoffproduktion und Reichweite des Dorfes werden durch das Gebäude gesteuert.</p>
                      <div className="building-costs">
                        <span>Holz: {cost.wood}</span>
                        <span>Lehm: {cost.clay}</span>
                        <span>Eisen: {cost.iron}</span>
                      </div>
                      <button className="upgrade" disabled={!canUpgrade} onClick={() => handleUpgrade(code)}>
                        {canUpgrade ? 'Ausbauen' : 'Maximal'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {activeTab === 'map' && (
          <WorldMap
            villages={game.world}
            selectedVillageId={selectedTargetId}
            onSelectVillage={(id) => setSelectedTargetId(id)}
          />
        )}

        {activeTab === 'troops' && (
          <>
            <div className="section-heading">
              <div><p className="eyebrow">MILITÄR</p><h2>Rekrutierung</h2></div>
            </div>

            <div className="building-grid">
              {UNIT_CODES.map((code) => (
                <div className="building-card" key={code}>
                  <div className="building-icon">{unitIcons[code]}</div>
                  <div className="building-meta">
                    <div className="building-title-row">
                      <h3>{code}</h3>
                      <span>{village.units[code]} im Lager</span>
                    </div>
                    <div className="building-costs">
                      <span>Pop: {code === 'spear' ? 1 : code === 'sword' || code === 'axe' || code === 'archer' ? 2 : code === 'light_cavalry' ? 3 : 5}</span>
                    </div>
                    <div className="recruit-controls">
                      <input
                        type="number"
                        min={1}
                        value={recruitQuantities[code] ?? 1}
                        onChange={(event) => setRecruitQuantities((prev) => ({ ...prev, [code]: Number(event.target.value || 1) }))}
                      />
                      <button className="upgrade" onClick={() => handleRecruit(code)}>Rekrutieren</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="section-heading">
              <div><p className="eyebrow">ANGRIFF</p><h2>Truppenbewegung</h2></div>
            </div>

            <div className="game-message">
              <label>
                Ziel auswählen
                <select value={selectedTargetId} onChange={(event) => setSelectedTargetId(event.target.value)}>
                  {game.world.filter((target) => target.id !== village.id).map((target) => (
                    <option key={target.id} value={target.id}>{target.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="building-grid">
              {UNIT_CODES.map((code) => (
                <div className="building-card" key={`${code}-attack`}>
                  <div className="building-icon">{unitIcons[code]}</div>
                  <div className="building-meta">
                    <div className="building-title-row">
                      <h3>{code}</h3>
                      <span>{village.units[code]} verfügbar</span>
                    </div>
                    <div className="recruit-controls">
                      <input
                        type="number"
                        min={0}
                        max={village.units[code]}
                        value={attackQuantities[code] ?? 0}
                        onChange={(event) => setAttackQuantities((prev) => ({ ...prev, [code]: Number(event.target.value || 0) }))}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button className="upgrade" onClick={handleAttack}>Angriff starten</button>
          </>
        )}
      </main>
    </div>
  )
}

export default App
