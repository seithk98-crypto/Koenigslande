
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import WorldMap from './WorldMap'
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

type Unit = {
  code: string
  name: string
  required_building_code: string
  required_building_level: number
  wood_cost: number
  clay_cost: number
  iron_cost: number
  population_cost: number
  build_seconds: number
  attack: number
  defense_infantry: number
  defense_cavalry: number
  carry_capacity: number
  quantity: number
  current_building_level: number
}

type Training = {
  id: string
  unit_code: string
  unit_name?: string
  quantity: number
  completed_quantity?: number
  started_at: string
  completes_at: string
  next_unit_at?: string
  status: string
}

type MilitaryState = {
  units: Unit[]
  training_queue: Training[]
}

type AttackTarget = {
  id: string
  name: string
  x: number
  y: number
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

const unitDetails: Record<string, { icon: string; building: string }> = {
  spear: { icon: '🗡️', building: 'Kaserne' },
  sword: { icon: '⚔️', building: 'Kaserne' },
  axe: { icon: '🪓', building: 'Kaserne' },
  archer: { icon: '🏹', building: 'Kaserne' },
  light_cavalry: { icon: '🐎', building: 'Stall' },
  heavy_cavalry: { icon: '🐴', building: 'Stall' },
  ram: { icon: '🪵', building: 'Werkstatt' },
  catapult: { icon: '🏹', building: 'Werkstatt' },
  paladin: { icon: '🛡️', building: 'Schmiede' },
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
  const [military, setMilitary] = useState<MilitaryState | null>(null)
  const [activeTab, setActiveTab] = useState<'village' | 'map' | 'troops'>('village')
  const [recruitAmounts, setRecruitAmounts] = useState<Record<string, number>>({})
  const [attackTargets, setAttackTargets] = useState<AttackTarget[]>([])
  const [selectedTargetId, setSelectedTargetId] = useState('')
  const [attackAmounts, setAttackAmounts] = useState<Record<string, number>>({})
  const [targetsLoading, setTargetsLoading] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [message, setMessage] = useState('Willkommen in deinem Dorf!')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [playerName, setPlayerName] = useState('Neuer Herrscher')

  const loadVillage = useCallback(async () => {
    const [villageResult, populationResult, militaryResult] = await Promise.all([
      supabase.rpc('get_my_village_state'),
      supabase.rpc('get_my_population_state'),
      supabase.rpc('get_my_military_state'),
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

    if (militaryResult.error) {
      setMessage(`Truppen konnten nicht geladen werden: ${militaryResult.error.message}`)
    } else if (militaryResult.data) {
      const militaryData = militaryResult.data as Record<string, unknown>
      const queue = militaryData.training_queue ?? militaryData.recruitment_queue ?? militaryData.queue
      setMilitary({
        units: Array.isArray(militaryData.units) ? militaryData.units as Unit[] : [],
        training_queue: Array.isArray(queue) ? queue as Training[] : [],
      })
    }

    setLoading(false)
  }, [])

  const loadAttackTargets = useCallback(async () => {
    setTargetsLoading(true)
    const { data, error } = await supabase.rpc('get_attack_targets')

    if (error) {
      setMessage(`Angriffsziele konnten nicht geladen werden: ${error.message}`)
    } else {
      const targets = Array.isArray(data) ? data as AttackTarget[] : []
      setAttackTargets(targets)
      setSelectedTargetId(current => current || targets[0]?.id || '')
    }

    setTargetsLoading(false)
  }, [])

  useEffect(() => {
    if (activeTab === 'troops') loadAttackTargets()
  }, [activeTab, loadAttackTargets])

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

  async function startAttack() {
    if (!game || !military || !selectedTargetId || busy) return

    const selectedUnits = Object.fromEntries(
      Object.entries(attackAmounts)
        .filter(([, quantity]) => Number.isInteger(quantity) && quantity > 0)
        .map(([code, quantity]) => [code, quantity])
    )

    if (Object.keys(selectedUnits).length === 0) {
      setMessage('Wähle mindestens eine Einheit für den Angriff.')
      return
    }

    setBusy(true)
    setMessage('Dein Angriff wird vorbereitet ...')

    const { data, error } = await supabase.rpc('start_attack', {
      p_origin_village_id: game.village.id,
      p_target_village_id: selectedTargetId,
      p_units: selectedUnits,
    })

    if (error) {
      setMessage(`Angriff konnte nicht gestartet werden: ${error.message}`)
      setBusy(false)
      await loadVillage()
      return
    }

    const arrival = data?.arrives_at
      ? new Date(data.arrives_at).toLocaleString('de-DE')
      : 'wird berechnet'

    setAttackAmounts({})
    setMessage(`Angriff unterwegs! Voraussichtliche Ankunft: ${arrival}`)
    await Promise.all([loadVillage(), loadAttackTargets()])
    setBusy(false)
  }

  async function recruitUnit(unit: Unit) {
    if (!game || !population || !military || busy) return

    const quantity = Math.max(1, Math.min(1000, Math.floor(recruitAmounts[unit.code] ?? 1)))
    if (unit.current_building_level < unit.required_building_level) {
      setMessage('Die benötigte Kaserne ist noch nicht weit genug ausgebaut.')
      return
    }
    if (population.available < unit.population_cost * quantity) {
      setMessage('Nicht genügend freie Bevölkerung für diese Truppenmenge.')
      return
    }
    if (game.resources.wood < unit.wood_cost * quantity || game.resources.clay < unit.clay_cost * quantity || game.resources.iron < unit.iron_cost * quantity) {
      setMessage('Nicht genügend Rohstoffe für diese Truppenmenge.')
      return
    }

    setBusy(true)
    setMessage(`Ausbildung von ${quantity} ${unit.name} wird gestartet ...`)
    const { error } = await supabase.rpc('start_recruitment', {
      p_unit_code: unit.code,
      p_quantity: quantity,
    })

    if (error) {
      setMessage(error.message)
      setBusy(false)
      await loadVillage()
      return
    }

    setMessage(`${quantity} ${unit.name} werden ausgebildet.`)
    await loadVillage()
    setBusy(false)
  }

  if (loading) {
    return (
      <div className="game">
        <main className="main">
          <h1>🏰 KÖNIGSLANDE</h1>
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
        <div className="logo">⚔️ <span>KÖNIGSLANDE</span></div>
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
        <button className={activeTab === 'village' ? 'active' : ''} onClick={() => setActiveTab('village')}>Dorf</button>
        <button className={activeTab === 'map' ? 'active' : ''} onClick={() => setActiveTab('map')}>Karte</button>
        <button className={activeTab === 'troops' ? 'active' : ''} onClick={() => setActiveTab('troops')}>Truppen</button>
        <button disabled>Berichte</button>
        <button disabled>Nachrichten</button>
        <button disabled>Stamm</button>
      </nav>

      <main className="main">
        {activeTab === 'village' ? (
          <>
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
          </>
        ) : activeTab === 'map' ? (
          <WorldMap villageName={village.name} villageX={village.x} villageY={village.y} />
        ) : (
          <section className="troops-view">
            <div className="section-heading">
              <div>
                <p className="eyebrow">DEIN HEER</p>
                <h2>Truppen ausbilden</h2>
              </div>
              <span className="building-count">{military?.units.reduce((sum, unit) => sum + unit.quantity, 0) ?? 0} Soldaten</span>
            </div>

            {military && military.training_queue.length > 0 ? (
              <div className="game-controls">
                <h2>Ausbildungswarteschlange</h2>
                <p>Die Aufträge werden der Reihe nach abgearbeitet. Jede Einheit wird einzeln fertiggestellt.</p>
                {military.training_queue.map((order, index) => {
                  const unit = military.units.find(item => item.code === order.unit_code)
                  const unitSeconds = Math.max(1, unit?.build_seconds ?? 1)
                  const orderStart = new Date(order.started_at).getTime()
                  const nextUnitAt = new Date(order.next_unit_at ?? order.started_at).getTime()
                  const completed = order.completed_quantity ?? 0
                  const remainingUnits = Math.max(0, order.quantity - completed)
                  const waiting = now < orderStart
                  const secondsLeft = Math.max(0, Math.ceil((nextUnitAt - now) / 1000))
                  const unitProgress = waiting
                    ? 0
                    : Math.max(0, Math.min(100, ((now - (nextUnitAt - unitSeconds * 1000)) / (unitSeconds * 1000)) * 100))

                  return (
                    <div className="training-order" key={order.id}>
                      <div className="training-order-heading">
                        <strong>{index + 1}. {order.unit_name ?? unit?.name ?? order.unit_code}</strong>
                        <span>{completed} / {order.quantity} fertig</span>
                      </div>
                      <p>{remainingUnits} Einheiten noch im Auftrag</p>
                      {waiting ? (
                        <p>Startet: {new Date(order.started_at).toLocaleString('de-DE')}</p>
                      ) : (
                        <p>Nächste Einheit fertig in: <strong>{formatTime(secondsLeft)}</strong></p>
                      )}
                      <div className="construction-bar">
                        <div className="construction-progress" style={{ width: `${unitProgress}%` }} />
                      </div>
                      <p>Auftrag vollständig fertig: {new Date(order.completes_at).toLocaleString('de-DE')}</p>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="game-controls">
                <p>Aktuell werden keine Truppen ausgebildet.</p>
              </div>
            )}

            <div className="game-controls attack-panel">
              <h2>⚔️ Angriff starten</h2>
              <p>Wähle ein feindliches Dorf und stelle deine Angriffstruppen zusammen. Die Reisezeit richtet sich nach der langsamsten Einheit.</p>

              {targetsLoading ? (
                <p>Feindliche Dörfer werden geladen ...</p>
              ) : attackTargets.length === 0 ? (
                <p>Aktuell wurden keine fremden Dörfer in deiner Welt gefunden.</p>
              ) : (
                <>
                  <label className="unit-amount attack-target">
                    Angriffsziel
                    <select
                      value={selectedTargetId}
                      onChange={event => setSelectedTargetId(event.target.value)}
                    >
                      {attackTargets.map(target => (
                        <option key={target.id} value={target.id}>
                          {target.name} ({target.x} | {target.y})
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="attack-unit-list">
                    {military?.units.filter(unit => unit.quantity > 0).map(unit => {
                      const amount = Math.max(0, Math.min(unit.quantity, Math.floor(attackAmounts[unit.code] ?? 0)))
                      return (
                        <label className="attack-unit-row" key={unit.code}>
                          <span>{unitDetails[unit.code]?.icon ?? '🪖'} {unit.name}</span>
                          <span>Verfügbar: {formatNumber(unit.quantity)}</span>
                          <input
                            type="number"
                            min="0"
                            max={unit.quantity}
                            value={amount}
                            onChange={event => setAttackAmounts(current => ({
                              ...current,
                              [unit.code]: Math.max(0, Math.min(unit.quantity, Math.floor(Number(event.target.value) || 0))),
                            }))}
                          />
                          <button
                            type="button"
                            className="upgrade"
                            onClick={() => setAttackAmounts(current => ({ ...current, [unit.code]: unit.quantity }))}
                          >
                            Alle
                          </button>
                        </label>
                      )
                    })}
                  </div>

                  <button
                    className="upgrade attack-submit"
                    disabled={busy || !selectedTargetId || !military?.units.some(unit => (attackAmounts[unit.code] ?? 0) > 0)}
                    onClick={startAttack}
                  >
                    {busy ? 'Angriff wird gestartet ...' : 'Angriff losschicken'}
                  </button>
                </>
              )}
            </div>

            <div className="unit-grid">
              {military?.units.map(unit => {
                const amount = Math.max(1, Math.min(1000, Math.floor(recruitAmounts[unit.code] ?? 1)))
                const hasBuilding = unit.current_building_level >= unit.required_building_level
                const enoughResources =
                  resources.wood >= unit.wood_cost * amount &&
                  resources.clay >= unit.clay_cost * amount &&
                  resources.iron >= unit.iron_cost * amount
                const enoughPopulation = Boolean(population && population.available >= unit.population_cost * amount)

                return (
                  <article className="unit-card" key={unit.code}>
                    <div className="unit-card-heading">
                      <div className="building-icon">{unitDetails[unit.code]?.icon ?? '🪖'}</div>
                      <div>
                        <h3>{unit.name}</h3>
                        <p>Im Dorf: <strong>{formatNumber(unit.quantity)}</strong></p>
                      </div>
                    </div>
                    <div className="unit-stats">
                      <span>Angriff: {unit.attack}</span>
                      <span>Abwehr Inf.: {unit.defense_infantry}</span>
                      <span>Abwehr Kav.: {unit.defense_cavalry}</span>
                      <span>Beute: {unit.carry_capacity}</span>
                    </div>
                    <p className="unit-requirement">
                      Voraussetzung: {unitDetails[unit.code]?.building ?? unit.required_building_code} Stufe {unit.required_building_level}
                      {' · '}Aktuell: {unit.current_building_level}
                      {hasBuilding ? ' ✅' : ' 🔒'}
                    </p>
                    <p className="unit-costs">
                      Kosten pro Einheit: 🪵 {formatNumber(unit.wood_cost)}
                      {' · '}🧱 {formatNumber(unit.clay_cost)}
                      {' · '}⛏️ {formatNumber(unit.iron_cost)}
                    </p>
                    <p className="unit-costs">
                      Bevölkerung: {unit.population_cost} · Ausbildungszeit: {formatTime(unit.build_seconds)}
                    </p>
                    <label className="unit-amount">
                      Anzahl
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={amount}
                        onChange={event => setRecruitAmounts(current => ({ ...current, [unit.code]: Math.max(1, Math.min(1000, Number(event.target.value) || 1)) }))}
                      />
                    </label>
                    <button
                      className="upgrade"
                      disabled={busy || !hasBuilding || !enoughResources || !enoughPopulation}
                      onClick={() => recruitUnit(unit)}
                    >
                      {!hasBuilding ? 'Kaserne ausbauen' : !enoughResources ? 'Zu wenig Rohstoffe' : !enoughPopulation ? 'Zu wenig Bevölkerung' : 'In Warteschlange einreihen'}
                    </button>
                  </article>
                )
              })}
            </div>
            {!military && <p>Truppendaten werden geladen ...</p>}
          </section>
        )}
      </main>

      <footer>
        KÖNIGSLANDE · Eine Welt. Viele Herrscher. Ein Schicksal.
      </footer>
    </div>
  )
}

export default App
