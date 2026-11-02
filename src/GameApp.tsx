import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowUp, Axe, Building2, Castle, Clock3, Coins, Crown, Hammer, House, Map as MapIcon, Swords,
  Pickaxe, Shield, Trees, Users, Wheat,
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type {
  BuildingCode, MovementOverview, UnitCode, Village, WorldTile,
} from './types'
import WorldMap from './WorldMap'

const MultiplayerView = lazy(() => import('./MultiplayerView'))

const BUILDINGS: Record<BuildingCode, { label: string; icon: typeof House }> = {
  headquarters: { label: 'Hauptgebäude', icon: Castle },
  woodcutter: { label: 'Holzfäller', icon: Trees },
  clay_pit: { label: 'Lehmgrube', icon: Building2 },
  iron_mine: { label: 'Eisenmine', icon: Pickaxe },
  farm: { label: 'Bauernhof', icon: Wheat },
  warehouse: { label: 'Speicher', icon: Coins },
  barracks: { label: 'Kaserne', icon: Shield },
  smithy: { label: 'Schmiede', icon: Hammer },
  stable: { label: 'Stall', icon: House },
  workshop: { label: 'Werkstatt', icon: Axe },
  market: { label: 'Marktplatz', icon: Coins },
  rally_point: { label: 'Versammlungsplatz', icon: MapIcon },
}

const FACILITY_NAMES: Record<'barracks' | 'stable' | 'workshop', string> = {
  barracks: 'Kaserne',
  stable: 'Stall',
  workshop: 'Werkstatt',
}

type Props = { session: Session }

function errorMessage(value: unknown) {
  if (value instanceof Error) return value.message
  if (typeof value === 'object' && value !== null && 'message' in value && typeof value.message === 'string') {
    return value.message
  }
  return 'Die Verbindung zur Welt ist fehlgeschlagen.'
}

function currentTime() {
  return Date.now()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export default function GameApp({ session }: Props) {
  const [village, setVillage] = useState<Village | null>(null)
  const [ownedVillages, setOwnedVillages] = useState<Village[]>([])
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [profileDisplayName, setProfileDisplayName] = useState('')
  const [founding, setFounding] = useState(false)
  const [upgrading, setUpgrading] = useState<BuildingCode | null>(null)
  const [recruiting, setRecruiting] = useState<UnitCode | null>(null)
  const [releasing, setReleasing] = useState<UnitCode | null>(null)
  const [recruitQuantities, setRecruitQuantities] = useState<Partial<Record<UnitCode, number>>>({})
  const [releaseQuantities, setReleaseQuantities] = useState<Partial<Record<UnitCode, number>>>({})
  const [villageName, setVillageName] = useState(String(session.user.user_metadata.display_name ?? ''))
  const [error, setError] = useState('')
  const [economyError, setEconomyError] = useState('')
  const [clockNow, setClockNow] = useState(0)
  const [economyObservedAt, setEconomyObservedAt] = useState(0)
  const requestIds = useRef(new Map<BuildingCode, string>())
  const recruitmentRequestIds = useRef(new Map<UnitCode, string>())
  const [view, setView] = useState<'world' | 'village' | 'military' | 'attacks' | 'community'>('world')
  const [movementOverview, setMovementOverview] = useState<MovementOverview | null>(null)
  const [movementLoading, setMovementLoading] = useState(false)
  const [movementSending, setMovementSending] = useState(false)
  const [additionalVillageName, setAdditionalVillageName] = useState('')
  const [foundingAdditionalVillage, setFoundingAdditionalVillage] = useState(false)
  const [selectedSourceId, setSelectedSourceId] = useState('')
  const [selectedTargetId, setSelectedTargetId] = useState('')
  const [movementKind, setMovementKind] = useState<'attack' | 'scout'>('attack')
  const [selectedTroops, setSelectedTroops] = useState<Partial<Record<UnitCode, number>>>({})
  const [center, setCenter] = useState({ x: 0, y: 0 })
  const [radius, setRadius] = useState(10)
  const [tiles, setTiles] = useState<WorldTile[]>([])
  const [mapLoading, setMapLoading] = useState(true)
  const [mapError, setMapError] = useState('')
  const [selectedTile, setSelectedTile] = useState<WorldTile | null>(null)
  const currentVillageId = village?.id

  function updateOwnedVillage(nextVillage: Village) {
    setVillage(nextVillage)
    setOwnedVillages((current) => current.map((entry) => entry.id === nextVillage.id ? nextVillage : entry))
  }

  useEffect(() => {
    let active = true
    async function loadVillage() {
      if (!supabase) return
      try {
        const { data, error: resultError } = await supabase.rpc('get_owned_villages')
        if (!active) return
        if (resultError) setError(resultError.message)
        else {
          const villages = (data ?? []) as Village[]
          const result = villages[0] ?? null
          setOwnedVillages(villages)
          setVillage(result)
          const { data: profileData, error: profileError } = await supabase.rpc('get_public_player_profile', {
            p_player_id: session.user.id,
          })
          if (profileError) setEconomyError(profileError.message)
          else if (profileData && typeof profileData === 'object' && 'username' in profileData && typeof profileData.username === 'string') {
            setProfileDisplayName(profileData.username)
          }
          if (result) {
            const observedAt = currentTime()
            setEconomyObservedAt(observedAt)
            setClockNow(observedAt)
            setCenter({ x: result.x, y: result.y })
            setVillageName(result.name)
          }
        }
      } catch (caught) {
        if (!active) return
        setError(errorMessage(caught))
      } finally {
        if (active) {
          setChecked(true)
          setLoading(false)
        }
      }
    }
    void loadVillage()
    return () => { active = false }
  }, [session.user.id])

  useEffect(() => {
    if (!currentVillageId || !supabase) return
    const client = supabase
    const clockTimer = window.setInterval(() => setClockNow(currentTime()), 1000)
    const refreshTimer = window.setInterval(() => {
      void (async () => {
        try {
          const { data, error: resultError } = await client.rpc('get_owned_villages')
          if (resultError) {
            setEconomyError(resultError.message)
            return
          }
          const villages = (data ?? []) as Village[]
          if (villages.length === 0) {
            setVillage(null)
            setOwnedVillages([])
            setEconomyError('Dein Dorf konnte nicht mehr geladen werden.')
            return
          }
          setOwnedVillages(villages)
          const selected = villages.find((entry) => entry.id === currentVillageId) ?? villages[0]
          setVillage(selected)
          const observedAt = currentTime()
          setEconomyObservedAt(observedAt)
          setClockNow(observedAt)
          setEconomyError('')
        } catch (caught) {
          setEconomyError(errorMessage(caught))
        }
      })()
    }, 15000)
    return () => {
      window.clearInterval(clockTimer)
      window.clearInterval(refreshTimer)
    }
  }, [session.user.id, currentVillageId])

  useEffect(() => {
    if (!currentVillageId || view !== 'world' || !supabase) return
    const client = supabase
    let active = true
    const refreshMap = async () => {
      try {
        const { data, error: resultError } = await client.rpc('get_world_map', {
          p_center_x: center.x,
          p_center_y: center.y,
          p_radius: radius,
        })
        if (!active) return
        if (resultError) setMapError(resultError.message)
        else {
          const result = (data ?? []) as WorldTile[]
          setTiles(result)
          setSelectedTile((current) => result.find((tile) => tile.village_id === currentVillageId)
            ?? result.find((tile) => tile.village_id === current?.village_id)
            ?? null)
          setMapError('')
        }
      } catch (caught) {
        if (active) setMapError(errorMessage(caught))
      } finally {
        if (active) setMapLoading(false)
      }
    }
    void refreshMap()
    const refreshTimer = window.setInterval(() => void refreshMap(), 30000)
    return () => {
      active = false
      window.clearInterval(refreshTimer)
    }
  }, [center.x, center.y, radius, view, currentVillageId])

  useEffect(() => {
    if (view !== 'attacks' || !supabase) return
    const client = supabase
    let active = true
    const refreshMovements = async () => {
      try {
        const { data, error: resultError } = await client.rpc('get_movement_overview')
        if (!active) return
        if (resultError) {
          setEconomyError(resultError.message)
          return
        }
        const result = data as MovementOverview
        setMovementOverview(result)
        setSelectedSourceId((current) => result.sources.some((source) => source.id === current)
          ? current
          : result.sources.find((source) => source.id === village?.id)?.id ?? result.sources[0]?.id ?? '')
        setSelectedTargetId((current) => result.targets.some((target) => target.id === current)
          ? current
          : result.targets[0]?.id ?? '')
        setEconomyError('')
      } catch (caught) {
        if (active) setEconomyError(errorMessage(caught))
      } finally {
        if (active) setMovementLoading(false)
      }
    }

    void refreshMovements()
    const timer = window.setInterval(() => void refreshMovements(), 10000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [session.user.id, view, village?.id])

  async function createVillage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setFounding(true)
    setError('')
    try {
      const { error: resultError } = await supabase.rpc('found_starting_village', { p_name: villageName.trim() })
      if (resultError) {
        setError(resultError.message)
        return
      }
      const { data, error: stateError } = await supabase.rpc('get_owned_villages')
      if (stateError) {
        setError(stateError.message)
        return
      }
      const villages = (data ?? []) as Village[]
      if (!villages.length) {
        setError('Der Server hat das gegründete Dorf nicht zurückgegeben.')
        return
      }
      setOwnedVillages(villages)
      const result = villages[0]
      setVillage(result)
      const observedAt = currentTime()
      setEconomyObservedAt(observedAt)
      setClockNow(observedAt)
      setChecked(true)
      setMapLoading(true)
      setCenter({ x: result.x, y: result.y })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setFounding(false)
    }
  }

  async function createAdditionalVillage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !village || foundingAdditionalVillage) return
    setFoundingAdditionalVillage(true)
    setEconomyError('')
    try {
      const { data, error: resultError } = await supabase.rpc('found_additional_village', {
        p_source_village_id: village.id,
        p_name: additionalVillageName.trim(),
      })
      if (resultError) {
        setEconomyError(resultError.message)
        return
      }
      if (!data) {
        setEconomyError('Der Server hat das neue Dorf nicht zurückgegeben.')
        return
      }
      const newVillage = data as Village
      const { data: currentVillages, error: stateError } = await supabase.rpc('get_owned_villages')
      if (stateError) {
        setEconomyError(stateError.message)
        return
      }
      const refreshedVillages = (currentVillages ?? []) as Village[]
      setOwnedVillages(refreshedVillages)
      setVillage(refreshedVillages.find((entry) => entry.id === newVillage.id) ?? newVillage)
      setAdditionalVillageName('')
      setCenter({ x: newVillage.x, y: newVillage.y })
      setMapLoading(true)
      const observedAt = currentTime()
      setEconomyObservedAt(observedAt)
      setClockNow(observedAt)
    } catch (caught) {
      setEconomyError(errorMessage(caught))
    } finally {
      setFoundingAdditionalVillage(false)
    }
  }

  async function selectVillage(villageId: string) {
    if (!supabase || villageId === village?.id) return
    setLoading(true)
    setEconomyError('')
    try {
      const { data, error: resultError } = await supabase.rpc('get_village_state', { p_village_id: villageId })
      if (resultError) {
        setEconomyError(resultError.message)
        return
      }
      if (!data) {
        setEconomyError('Das ausgewählte Dorf konnte nicht geladen werden.')
        return
      }
      const selectedVillage = data as Village
      setVillage(selectedVillage)
      setOwnedVillages((current) => current.map((entry) => entry.id === selectedVillage.id ? selectedVillage : entry))
      setCenter({ x: selectedVillage.x, y: selectedVillage.y })
      setMapLoading(true)
      const observedAt = currentTime()
      setEconomyObservedAt(observedAt)
      setClockNow(observedAt)
    } catch (caught) {
      setEconomyError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }

  async function startBuildingUpgrade(code: BuildingCode) {
    if (!supabase || !village || upgrading) return
    const activeVillage = village
    const requestId = requestIds.current.get(code) ?? crypto.randomUUID()
    requestIds.current.set(code, requestId)
    setUpgrading(code)
    setEconomyError('')
    try {
      const { data, error: resultError } = await supabase.rpc('start_building_upgrade', {
        p_building_code: code,
        p_request_id: requestId,
      })
      if (resultError) {
        setEconomyError(resultError.message)
        return
      }
      if (!data) {
        setEconomyError('Der Server hat keinen aktualisierten Dorfstand zurückgegeben.')
        return
      }
      const current = data as Omit<Village, 'troops' | 'units' | 'recruitment_queue' | 'recruitment_time_factor'>
      const updatedVillage = {
        ...current,
        troops: activeVillage.troops,
        units: activeVillage.units,
        recruitment_queue: activeVillage.recruitment_queue,
        recruitment_time_factor: activeVillage.recruitment_time_factor,
      } as Village
      updateOwnedVillage(updatedVillage)
      const observedAt = currentTime()
      setEconomyObservedAt(observedAt)
      setClockNow(observedAt)
      requestIds.current.delete(code)
    } catch (caught) {
      setEconomyError(errorMessage(caught))
    } finally {
      setUpgrading(null)
    }
  }

  async function startRecruitment(unitCode: UnitCode) {
    if (!supabase || !village || recruiting || releasing) return
    const activeVillage = village
    const quantity = recruitQuantities[unitCode] ?? 1
    const requestId = recruitmentRequestIds.current.get(unitCode) ?? crypto.randomUUID()
    recruitmentRequestIds.current.set(unitCode, requestId)
    setRecruiting(unitCode)
    setEconomyError('')
    try {
      const { data, error: resultError } = await supabase.rpc('start_recruitment', {
        p_village_id: activeVillage.id,
        p_unit_code: unitCode,
        p_quantity: quantity,
        p_request_id: requestId,
      })
      if (resultError) {
        setEconomyError(resultError.message)
        return
      }
      if (!data) {
        setEconomyError('Der Server hat keinen aktualisierten Dorfstand zurückgegeben.')
        return
      }
      updateOwnedVillage(data as Village)
      const observedAt = currentTime()
      setEconomyObservedAt(observedAt)
      setClockNow(observedAt)
      recruitmentRequestIds.current.delete(unitCode)
    } catch (caught) {
      setEconomyError(errorMessage(caught))
    } finally {
      setRecruiting(null)
    }
  }

  async function releaseTroops(unitCode: UnitCode) {
    if (!supabase || !village || recruiting || releasing) return
    const activeVillage = village
    const quantity = releaseQuantities[unitCode] ?? 1
    setReleasing(unitCode)
    setEconomyError('')
    try {
      const { data, error: resultError } = await supabase.rpc('release_troops', {
        p_village_id: activeVillage.id,
        p_unit_code: unitCode,
        p_quantity: quantity,
      })
      if (resultError) {
        setEconomyError(resultError.message)
        return
      }
      if (!data) {
        setEconomyError('Der Server hat keinen aktualisierten Dorfstand zurückgegeben.')
        return
      }
      updateOwnedVillage(data as Village)
      const observedAt = currentTime()
      setEconomyObservedAt(observedAt)
      setClockNow(observedAt)
    } catch (caught) {
      setEconomyError(errorMessage(caught))
    } finally {
      setReleasing(null)
    }
  }

  async function sendMovement() {
    if (!supabase || !movementOverview || !village || movementSending) return
    const activeVillageId = village.id
    const source = movementOverview.sources.find((entry) => entry.id === selectedSourceId)
    const target = movementOverview.targets.find((entry) => entry.id === selectedTargetId)
    const troops = Object.fromEntries(
      Object.entries(selectedTroops).filter(([, quantity]) => (quantity ?? 0) > 0),
    ) as Partial<Record<UnitCode, number>>
    if (!source || !target || Object.keys(troops).length === 0) {
      setEconomyError('Wähle ein Ausgangsdorf, ein Ziel und mindestens eine verfügbare Einheit.')
      return
    }
    if (movementKind === 'scout' && (Object.keys(troops).length !== 1 || !troops.scout)) {
      setEconomyError('Ein Spähangriff kann ausschließlich Späher entsenden.')
      return
    }
    const confirmation = `${movementKind === 'scout' ? 'Spähangriff' : 'Angriff'} von ${source.name} nach ${target.name} senden?\n\nEntfernung: ${attackDistance.toFixed(2)} Felder\nReisezeit: ${formatDuration(estimatedTravelSeconds)}\nVoraussichtliche Ankunft: ${estimatedArrival.toLocaleString('de-DE')}\n\nEntsendete Truppen können bis zur Rückkehr nicht anderweitig eingesetzt werden.`
    if (!window.confirm(confirmation)) return

    setMovementSending(true)
    setEconomyError('')
    try {
      const { data, error: resultError } = await supabase.rpc('send_troop_movement', {
        p_source_village_id: source.id,
        p_target_village_id: target.id,
        p_movement_type: movementKind,
        p_troops: troops,
        p_request_id: crypto.randomUUID(),
      })
      if (resultError) {
        setEconomyError(resultError.message)
        return
      }
      if (!data) {
        setEconomyError('Der Server hat keine aktualisierte Bewegungsübersicht zurückgegeben.')
        return
      }
      setMovementOverview(data as MovementOverview)
      setSelectedTroops({})
      const { data: updatedVillages, error: villageError } = await supabase.rpc('get_owned_villages')
      if (villageError) setEconomyError(villageError.message)
      else if (updatedVillages) {
        const owned = updatedVillages as Village[]
        setOwnedVillages(owned)
        const activeVillage = owned.find((entry) => entry.id === activeVillageId)
        if (activeVillage) setVillage(activeVillage)
      }
    } catch (caught) {
      setEconomyError(errorMessage(caught))
    } finally {
      setMovementSending(false)
    }
  }

  function moveMap(x: number, y: number) {
    const nextCenter = { x: Math.max(-100, Math.min(100, x)), y: Math.max(-100, Math.min(100, y)) }
    if (nextCenter.x === center.x && nextCenter.y === center.y) return
    setMapLoading(true)
    setMapError('')
    setCenter(nextCenter)
  }

  function changeRadius(nextRadius: number) {
    if (nextRadius === radius) return
    setMapLoading(true)
    setMapError('')
    setRadius(nextRadius)
  }

  function changeView(nextView: 'world' | 'village' | 'military' | 'attacks' | 'community') {
    if (nextView === view) return
    setView(nextView)
    if (nextView === 'attacks') setMovementLoading(true)
    if (nextView === 'world') {
      setMapLoading(true)
      setMapError('')
    }
  }

  if (loading || !checked) return <main className="game-loading"><Crown aria-hidden="true" /><span>Dein Lehen wird gesucht</span></main>

  if (error && !village) {
    return <main className="founding-screen"><section className="founding-panel"><div className="founding-icon"><Castle size={31} /></div><p className="eyebrow">VERBINDUNG ZUR WELT FEHLGESCHLAGEN</p><h1>Dein Lehen konnte nicht geladen werden.</h1><p className="error-copy">{error}</p><button className="primary-button" onClick={() => window.location.reload()}>Erneut versuchen</button></section></main>
  }

  if (!village) {
    return (
      <main className="founding-screen">
        <section className="founding-panel">
          <div className="founding-icon"><Castle size={31} /></div>
          <p className="eyebrow">DEIN ANFANG IN DER WELT</p>
          <h1>Gründe dein erstes Dorf.</h1>
          <p>Ein freier Ort nahe dem Herzen der Welt wird bei der Gründung dauerhaft für dich reserviert.</p>
          <form onSubmit={createVillage} className="founding-form">
            <label htmlFor="village-name">Name deiner Siedlung</label>
            <input id="village-name" value={villageName} onChange={(event) => setVillageName(event.target.value)} minLength={3} maxLength={32} required placeholder="z. B. Morgenhain" />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="primary-button" disabled={founding}>{founding ? 'Siedlungsplatz wird reserviert …' : 'Dorf gründen'}</button>
          </form>
          <p className="server-note"><Shield size={15} /> Standort und Dorf werden atomar auf dem Server angelegt.</p>
        </section>
      </main>
    )
  }

  const profileName = profileDisplayName || session.user.user_metadata.display_name || session.user.email || 'Herrscher'
  const coordinateLabel = `(${village.x} | ${village.y})`
  const resources = [
    { key: 'wood', label: 'Holz', value: village.resources.wood, rate: village.production_per_hour.wood, icon: Trees },
    { key: 'clay', label: 'Lehm', value: village.resources.clay, rate: village.production_per_hour.clay, icon: Building2 },
    { key: 'iron', label: 'Eisen', value: village.resources.iron, rate: village.production_per_hour.iron, icon: Pickaxe },
    { key: 'food', label: 'Proviant', value: village.resources.food, rate: null, icon: Wheat },
  ]
  const queuedByBuilding = village.construction_queue.reduce<Partial<Record<BuildingCode, number>>>((counts, job) => {
    counts[job.building_code] = (counts[job.building_code] ?? 0) + 1
    return counts
  }, {})
  const elapsedSinceRefresh = Math.floor((clockNow - economyObservedAt) / 1000)
  const formatDuration = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remainingSeconds = seconds % 60
    const time = [hours, minutes, remainingSeconds].map((part) => String(part).padStart(2, '0')).join(':')
    return days > 0 ? `${days} T. ${time}` : time
  }
  const attackSource = movementOverview?.sources.find((source) => source.id === selectedSourceId)
  const attackTarget = movementOverview?.targets.find((target) => target.id === selectedTargetId)
  const selectedUnitEntries = village.units.filter((unit) => (selectedTroops[unit.unit_code] ?? 0) > 0)
  const attackDistance = attackSource && attackTarget
    ? Math.hypot(attackTarget.x - attackSource.x, attackTarget.y - attackSource.y)
    : 0
  const slowestSelectedUnit = selectedUnitEntries.reduce((slowest, unit) =>
    Math.max(slowest, unit.speed_minutes_per_field), 0)
  const estimatedTravelSeconds = Math.ceil(attackDistance * slowestSelectedUnit * 60)
  const estimatedArrival = new Date(currentTime() + estimatedTravelSeconds * 1000)
  const estimatedAttackStrength = selectedUnitEntries.reduce(
    (strength, unit) => strength + unit.attack * (selectedTroops[unit.unit_code] ?? 0),
    0,
  )
  const formatTroops = (value: unknown) => {
    if (!isRecord(value)) return 'Truppenstärke unbekannt'
    const troopSummary = Object.entries(value)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0)
      .map(([unitCode, quantity]) => `${village.units.find((unit) => unit.unit_code === unitCode)?.name ?? unitCode}: ${quantity.toLocaleString('de-DE')}`)
    return troopSummary.length ? troopSummary.join(' · ') : 'Keine Überlebenden'
  }

  return (
    <div className="game-shell">
      <header className="game-header">
        <a className="game-brand" href="#welt" onClick={(event) => { event.preventDefault(); changeView('world') }}><span className="brand-mark"><Crown size={21} /></span><span><strong>KÖNIGSLANDE</strong><small>GRENZLAND · I</small></span></a>
        <div className="world-status"><span className="status-dot" /> GEMEINSAME WELT <i /> WELT I</div>
        <div className="resource-strip" aria-label="Rohstoffbestand">{resources.map(({ key, label, value, icon: Icon }) => <div className="resource-item" key={key} title={label}><Icon size={16} aria-hidden="true" /><span className="resource-label">{label}</span><strong>{Math.floor(value).toLocaleString('de-DE')}</strong></div>)}</div>
        <div className="account-chip"><span>{profileName.slice(0, 1).toUpperCase()}</span><strong>{profileName}</strong></div>
      </header>
      {economyError && <p className="economy-error global-economy-error" role="alert">{economyError}</p>}
      <div className="game-layout">
        <aside className="side-rail">
          <p className="rail-caption">KÖNIGREICH</p>
          <button type="button" className={view === 'world' ? 'rail-link active' : 'rail-link'} onClick={() => changeView('world')}><MapIcon size={18} /><span>Weltkarte</span></button>
          <button type="button" className={view === 'village' ? 'rail-link active' : 'rail-link'} onClick={() => changeView('village')}><House size={18} /><span>Dorf</span></button>
          <button type="button" className={view === 'military' ? 'rail-link active' : 'rail-link'} onClick={() => changeView('military')}><Swords size={18} /><span>Militär</span></button>
          <button type="button" className={view === 'attacks' ? 'rail-link active' : 'rail-link'} onClick={() => changeView('attacks')}><ArrowUp size={18} /><span>Angriffe</span></button>
          <button type="button" className={view === 'community' ? 'rail-link active' : 'rail-link'} onClick={() => changeView('community')}><Users size={18} /><span>Gemeinschaft</span></button>
          <label className="rail-village-switch"><span className="rail-village-icon"><Castle size={17} /></span><span><small>AKTIVES DORF</small><select value={village.id} onChange={(event) => void selectVillage(event.target.value)} aria-label="Aktives Dorf wechseln">{ownedVillages.map((owned) => <option key={owned.id} value={owned.id}>{owned.name} ({owned.x} | {owned.y})</option>)}</select></span></label>
          <div className="rail-bottom"><span>PHASE E</span><span>ALPHA</span></div>
        </aside>
        <main className="main-stage">
          {view === 'world' ? <WorldMap tiles={tiles} center={center} radius={radius} loading={mapLoading} error={mapError} ownVillageIds={ownedVillages.map((owned) => owned.id)} ownAllianceTag={tiles.find((tile) => tile.village_id && ownedVillages.some((owned) => owned.id === tile.village_id))?.alliance_tag ?? null} selectedTile={selectedTile} onSelectTile={setSelectedTile} onMove={moveMap} onRadiusChange={changeRadius} /> : view === 'community' ? <Suspense fallback={<div className="game-loading"><Crown aria-hidden="true" /><span>Gemeinschaft wird geladen</span></div>}><MultiplayerView playerId={session.user.id} onProfileNameChange={setProfileDisplayName} /></Suspense> : view === 'attacks' ? (
            <section className="village-view attack-view">
              <div className="view-kicker"><span>FELDZUG · WELT I</span><span>{movementOverview?.movements.length ?? 0} BEWEGUNGEN</span></div>
              <div className="village-heading"><div><p className="eyebrow">HEERESVERWALTUNG</p><h1>Angriffe &amp; Bewegungen</h1></div><div className="points-seal"><Swords size={17} /><span><strong>{movementOverview?.sources.length ?? 0}</strong><small>QUELLDÖRFER</small></span></div></div>
              <p className="military-intro">Wähle ein eigenes Ausgangsdorf und ein fremdes oder neutrales Ziel. Reisezeit und Kampf werden vom Server berechnet; die Vorschau ist unverbindlich.</p>
              {economyError && <p className="economy-error" role="alert">{economyError}</p>}
              <section className="attack-composer">
                <div className="section-title"><div><p className="eyebrow">NEUER FELDZUG</p><h2>Truppen entsenden</h2></div><span>SERVERSEITIG VERARBEITET</span></div>
                {movementLoading && !movementOverview ? <p className="queue-empty">Eigene Dörfer und Ziele werden geladen …</p> : !movementOverview?.sources.length ? <p className="queue-empty">Es wurde noch kein eigenes Dorf gefunden.</p> : <>
                  <div className="attack-route-selectors">
                    <label>Ausgangsdorf<select value={selectedSourceId} onChange={(event) => { setSelectedSourceId(event.target.value); setSelectedTroops({}) }}>{movementOverview.sources.map((source) => <option key={source.id} value={source.id}>{source.name} ({source.x} | {source.y})</option>)}</select></label>
                    <span className="route-arrow">→</span>
                    <label>Zieldorf<select value={selectedTargetId} onChange={(event) => setSelectedTargetId(event.target.value)}><option value="">Ziel wählen …</option>{movementOverview.targets.map((target) => <option key={target.id} value={target.id}>{target.name} · {target.is_barbarian ? 'neutral' : target.owner_name ?? 'Spieler'} ({target.x} | {target.y})</option>)}</select></label>
                  </div>
                  <div className="movement-kind-select" role="group" aria-label="Bewegungsart">
                    <button type="button" className={movementKind === 'attack' ? 'selected' : ''} onClick={() => { setMovementKind('attack'); setSelectedTroops({}) }}>Angriff</button>
                    <button type="button" className={movementKind === 'scout' ? 'selected' : ''} onClick={() => { setMovementKind('scout'); setSelectedTroops({}) }}>Spähangriff</button>
                  </div>
                  {attackSource && <div className="dispatch-unit-list">{village.units.filter((unit) => movementKind === 'attack' || unit.unit_code === 'scout').map((unit) => {
                    const available = attackSource.troops[unit.unit_code] ?? 0
                    const quantity = selectedTroops[unit.unit_code] ?? 0
                    return <label key={unit.unit_code} className={available > 0 ? 'dispatch-unit' : 'dispatch-unit unavailable'}>
                      <span>{unit.name}<small>Verfügbar: {available.toLocaleString('de-DE')}</small></span>
                      <input type="number" min={0} max={available} step={1} value={quantity} disabled={available === 0} onChange={(event) => setSelectedTroops((current) => ({ ...current, [unit.unit_code]: Math.max(0, Math.min(available, Number.parseInt(event.target.value, 10) || 0)) }))} aria-label={`${unit.name} entsenden`} />
                    </label>
                  })}</div>}
                  <div className="attack-estimate">
                    <div><span>Entfernung</span><strong>{attackSource && attackTarget ? attackDistance.toFixed(2) : '—'} Felder</strong></div>
                    <div><span>Reisezeit</span><strong>{estimatedTravelSeconds ? formatDuration(estimatedTravelSeconds) : '—'}</strong></div>
                    <div><span>Angriffsstärke</span><strong>{movementKind === 'scout' ? 'Spähmission' : estimatedAttackStrength.toLocaleString('de-DE')}</strong></div>
                    <div><span>Voraussichtliche Ankunft</span><strong>{estimatedTravelSeconds ? estimatedArrival.toLocaleString('de-DE') : '—'}</strong></div>
                  </div>
                  <button type="button" className="dispatch-button" onClick={() => void sendMovement()} disabled={!attackSource || !attackTarget || selectedUnitEntries.length === 0 || movementSending || movementKind === 'scout' && !selectedTroops.scout}>
                    {movementSending ? 'Truppen werden entsandt …' : movementKind === 'scout' ? 'Spähangriff bestätigen' : 'Angriff bestätigen'}
                  </button>
                </>}
              </section>
              <section className="construction-section movement-section">
                <div className="section-title"><div><p className="eyebrow">FELDZÜGE</p><h2>Laufende Bewegungen</h2></div><span>AKTUALISIERUNG ALLE 10 SEK.</span></div>
                {!movementOverview?.movements.length ? <p className="queue-empty">Keine laufenden Angriffe, Späher oder Rückkehrer.</p> : <ol className="construction-list movement-list">{movementOverview.movements.map((movement) => {
                  const movementLabel = movement.status === 'returning' || movement.movement_type === 'return'
                    ? 'Rückkehr eigener Truppen'
                    : movement.movement_type === 'scout' ? 'Spähangriff' : 'Angriff'
                  return <li key={movement.id}><span className="building-icon"><Swords size={17} /></span><span><strong>{movement.is_incoming ? 'Eingehend · ' : ''}{movementLabel}: {movement.source_name} → {movement.target_name}</strong><small>{formatTroops(movement.troops)} · Ankunft {new Date(movement.arrives_at).toLocaleString('de-DE')}</small></span><time dateTime={movement.arrives_at}><Clock3 size={13} />{formatDuration(movement.remaining_seconds)}</time></li>
                })}</ol>}
              </section>
              <section className="construction-section report-section">
                <div className="section-title"><div><p className="eyebrow">ARCHIV</p><h2>Kampf- und Spähberichte</h2></div><span>{movementOverview?.reports.length ?? 0} BERICHTE</span></div>
                {!movementOverview?.reports.length ? <p className="queue-empty">Noch keine Kampf- oder Spähergebnisse eingegangen.</p> : <div className="combat-report-list">{movementOverview.reports.map((report) => {
                  const data = report.report_data
                  const origin = isRecord(data.origin) ? data.origin : null
                  const target = isRecord(data.target) ? data.target : null
                  const losses = report.report_type === 'scout' ? data.scouts_lost : data.attacker_losses ?? data.defender_losses
                  const survivors = report.report_type === 'scout' ? data.scouts_returned : data.attacker_survivors ?? data.defender_survivors
                  const intel = isRecord(data.intel) ? data.intel : null
                  return <article className="combat-report-card" key={report.id}>
                    <div className="combat-report-heading"><span className="eyebrow">{report.report_type === 'scout' ? 'SPÄHBERICHT' : 'KAMPFBERICHT'}</span><time dateTime={report.created_at}>{new Date(report.created_at).toLocaleString('de-DE')}</time></div>
                    <h3>{String(origin?.name ?? 'Unbekannt')} → {String(target?.name ?? 'Unbekannt')}</h3>
                    <p className={`report-result result-${String(data.result ?? 'unknown')}`}>{report.report_type === 'scout' ? data.result === 'success' ? 'Spionage erfolgreich' : 'Spionage gescheitert' : data.result === 'attacker' ? 'Angriff gewonnen' : data.result === 'defeat' ? 'Dorf verteidigt' : 'Angriff abgewehrt'}</p>
                    {report.report_type === 'combat' && <><p><strong>Eigene Verluste:</strong> {formatTroops(losses)}</p><p><strong>Eigene Überlebende:</strong> {formatTroops(survivors)}</p><p><strong>Beute:</strong> Holz {isRecord(data.loot) ? String(data.loot.wood ?? 0) : '0'} · Lehm {isRecord(data.loot) ? String(data.loot.clay ?? 0) : '0'} · Eisen {isRecord(data.loot) ? String(data.loot.iron ?? 0) : '0'}</p></>}
                    {report.report_type === 'scout' && <><p><strong>Späher verloren:</strong> {String(losses ?? 0)} · <strong>zurück:</strong> {String(survivors ?? 0)}</p>{intel && <div className="scout-intel"><p><strong>Erbeutete Truppeninformation:</strong> {formatTroops(intel.troops)}</p>{isRecord(intel.resources) && <p><strong>Erbeutete Rohstoffinformation:</strong> Holz {String(intel.resources.wood ?? 0)} · Lehm {String(intel.resources.clay ?? 0)} · Eisen {String(intel.resources.iron ?? 0)}</p>}</div>}{typeof data.message === 'string' && <p>{data.message}</p>}</>}
                  </article>
                })}</div>}
              </section>
            </section>
          ) : view === 'military' ? (
            <section className="village-view military-view">
              <div className="view-kicker"><span>MILITÄR · {village.name}</span><span>{coordinateLabel}</span></div>
              <div className="village-heading"><div><p className="eyebrow">HEERESVERWALTUNG · WELT I</p><h1>Truppen &amp; Ausbildung</h1></div><div className="points-seal"><Users size={17} /><span><strong>{village.resources.population.toLocaleString('de-DE')} / {village.resources.population_capacity.toLocaleString('de-DE')}</strong><small>BEVÖLKERUNG</small></span></div></div>
              <p className="military-intro">Jedes Dorf führt einen eigenen Truppenbestand. Bevölkerung und Rohstoffe werden beim Einreihen serverseitig reserviert; Einheiten zählen nach abgeschlossener Ausbildung.</p>
              {economyError && <p className="economy-error" role="alert">{economyError}</p>}
              <section className="military-unit-list" aria-label="Einheiten und Rekrutierung">
                {village.units.map((unit) => {
                  const quantity = recruitQuantities[unit.unit_code] ?? 1
                  const releaseQuantity = releaseQuantities[unit.unit_code] ?? 1
                  const totalPopulation = quantity * unit.population_cost
                  const enoughPopulation = village.resources.population + totalPopulation <= village.resources.population_capacity
                  const enoughResources = unit.costs.wood * quantity <= village.resources.wood
                    && unit.costs.clay * quantity <= village.resources.clay
                    && unit.costs.iron * quantity <= village.resources.iron
                  const totalSeconds = Math.max(1, Math.ceil(unit.recruit_seconds * quantity * village.recruitment_time_factor))
                  const prerequisiteText = Object.entries(unit.prerequisites).map(([code, level]) =>
                    `${BUILDINGS[code as BuildingCode].label} Stufe ${level}`,
                  )
                  const facilityLevel = village.buildings[unit.facility] ?? 0
                  const facilityIcon = unit.category === 'Infanterie' ? Shield : unit.category === 'Kavallerie' ? House : Hammer
                  const FacilityIcon = facilityIcon
                  return <article className={unit.unlocked ? 'military-unit-card' : 'military-unit-card locked'} key={unit.unit_code}>
                    <div className="military-unit-heading">
                      <span className="military-unit-icon"><FacilityIcon size={20} /></span>
                      <div><p className="eyebrow">{unit.category}</p><h2>{unit.name}</h2><small>{FACILITY_NAMES[unit.facility]} · Stufe {facilityLevel}</small></div>
                      <span className="troop-count"><strong>{(village.troops[unit.unit_code] ?? 0).toLocaleString('de-DE')}</strong><small>IM DORF</small></span>
                    </div>
                    <dl className="unit-stats">
                      <div><dt>Angriff</dt><dd>{unit.attack}</dd></div>
                      <div><dt>Verteidigung · Inf.</dt><dd>{unit.defense_infantry}</dd></div>
                      <div><dt>Verteidigung · Kav.</dt><dd>{unit.defense_cavalry}</dd></div>
                      <div><dt>Geschwindigkeit</dt><dd>{unit.speed_minutes_per_field} Min./Feld</dd></div>
                      <div><dt>Tragfähigkeit</dt><dd>{unit.carry_capacity}</dd></div>
                      <div><dt>Bevölkerung</dt><dd>{unit.population_cost} je Einheit</dd></div>
                    </dl>
                    <p className="unit-cost-line">Kosten je Einheit: Holz {unit.costs.wood} · Lehm {unit.costs.clay} · Eisen {unit.costs.iron}</p>
                    <p className="unit-prerequisites"><strong>Voraussetzungen:</strong> {prerequisiteText.join(' · ')}</p>
                    {unit.unlocked ? <div className="recruit-controls">
                      <label>Anzahl <input type="number" min={1} max={10000} step={1} value={quantity} onChange={(event) => setRecruitQuantities((current) => ({ ...current, [unit.unit_code]: Math.max(1, Math.min(10000, Number.parseInt(event.target.value, 10) || 1)) }))} /></label>
                      <div className="recruit-total"><span>Gesamtkosten</span><strong>H {unit.costs.wood * quantity} · L {unit.costs.clay * quantity} · E {unit.costs.iron * quantity}</strong><small>{(unit.recruit_seconds * quantity).toLocaleString('de-DE')} Sek. Grundzeit · {formatDuration(totalSeconds)} mit Hauptgebäude</small></div>
                      <button type="button" className="upgrade-button recruit-button" disabled={!enoughResources || !enoughPopulation || !!recruiting || !!releasing} onClick={() => void startRecruitment(unit.unit_code)}>{recruiting === unit.unit_code ? 'Wird ausgebildet …' : !enoughResources ? 'Rohstoffe fehlen' : !enoughPopulation ? 'Bevölkerung fehlt' : 'Ausbilden'}</button>
                    </div> : <p className="unit-locked-note"><Shield size={15} /> Gesperrt: {prerequisiteText.join(' · ')}</p>}
                    {(village.troops[unit.unit_code] ?? 0) > 0 && <div className="release-controls">
                      <label>Auflösen <input type="number" min={1} max={village.troops[unit.unit_code]} step={1} value={releaseQuantity} onChange={(event) => setReleaseQuantities((current) => ({ ...current, [unit.unit_code]: Math.max(1, Math.min(village.troops[unit.unit_code], Number.parseInt(event.target.value, 10) || 1)) }))} /></label>
                      <button type="button" className="release-button" disabled={!!recruiting || !!releasing} onClick={() => void releaseTroops(unit.unit_code)}>{releasing === unit.unit_code ? 'Wird aufgelöst …' : 'Einheiten auflösen'}</button>
                    </div>}
                  </article>
                })}
              </section>
              <section className="construction-section recruitment-section">
                <div className="section-title"><div><p className="eyebrow">AUSBILDUNG</p><h2>Laufende Rekrutierungen</h2></div><span>{village.recruitment_queue.length} AUFTRÄGE</span></div>
                {village.recruitment_queue.length === 0 ? <p className="queue-empty">Aktuell sind keine Einheiten in Ausbildung.</p> : <ol className="construction-list">{village.recruitment_queue.map((job) => {
                  const unit = village.units.find((entry) => entry.unit_code === job.unit_code)
                  const remaining = Math.max(0, job.remaining_seconds - elapsedSinceRefresh)
                  return <li key={job.id}><span className="building-icon"><Users size={17} /></span><span><strong>{unit?.name ?? job.unit_code} · {job.quantity} Einheiten</strong><small>Fertig: {new Date(job.completes_at).toLocaleString('de-DE')}</small></span><time dateTime={job.completes_at}><Clock3 size={13} />{formatDuration(remaining)}</time></li>
                })}</ol>}
              </section>
            </section>
          ) : (
            <section className="village-view">
              <div className="view-kicker"><span>DEIN LEHEN</span><span>KOORDINATEN {coordinateLabel}</span></div>
              <div className="village-heading"><div><p className="eyebrow">SIEDLUNG · WELT I</p><h1>{village.name}</h1></div><div className="points-seal"><Crown size={17} /><span><strong>{village.points}</strong><small>PUNKTE</small></span></div></div>
              <div className="village-banner"><div className="banner-sky" /><div className="banner-hills hill-one" /><div className="banner-hills hill-two" /><div className="banner-hall"><Castle size={82} strokeWidth={1.15} /></div><div className="banner-copy"><span>DEIN ZUHAUSE</span><strong>{coordinateLabel}</strong></div></div>
              <section className="economy-summary" aria-label="Wirtschaft im Dorf">
                <div><Users size={17} /><span>Bevölkerung</span><strong>{village.resources.population.toLocaleString('de-DE')} / {village.resources.population_capacity.toLocaleString('de-DE')}</strong></div>
                <div><Coins size={17} /><span>Lagerkapazität je Rohstoff</span><strong>{village.resources.storage_capacity.toLocaleString('de-DE')}</strong></div>
                {resources.filter((resource) => resource.rate !== null).map((resource) => {
                  const Icon = resource.icon
                  return <div key={resource.key}><Icon size={17} /><span>{resource.label} pro Stunde</span><strong>+{resource.rate?.toLocaleString('de-DE')}</strong></div>
                })}
              </section>
              <div className="section-title"><div><p className="eyebrow">DORFVERWALTUNG</p><h2>Gebäude</h2></div><span>{Object.keys(village.buildings).length} BAUWERKE</span></div>
              <section className="construction-section expansion-section">
                <div className="section-title"><div><p className="eyebrow">REICH VERGRÖSSERN</p><h2>Neues Dorf gründen</h2></div><span>SERVERSEITIG GEPRÜFT</span></div>
                <p className="military-intro">Voraussetzungen und Kosten werden zentral auf dem Server geprüft: mindestens 100 Reichspunkte, höchstens 10 Dörfer und 1.500 Holz, 1.500 Lehm sowie 1.000 Eisen. Der Siedlungsplatz bleibt mindestens 5 Felder von bestehenden Dörfern entfernt.</p>
                <form className="expansion-form" onSubmit={(event) => void createAdditionalVillage(event)}>
                  <label>Name des neuen Dorfs<input value={additionalVillageName} onChange={(event) => setAdditionalVillageName(event.target.value)} minLength={3} maxLength={32} required /></label>
                  <button type="submit" className="dispatch-button" disabled={foundingAdditionalVillage}>{foundingAdditionalVillage ? 'Siedlungsplatz wird gesucht …' : 'Dorf gründen'}</button>
                </form>
              </section>
              <p className="building-cost-legend">Ausbaukosten: Holz (H) · Lehm (L) · Eisen (E)</p>
              <div className="building-list">{Object.entries(BUILDINGS).map(([code, details]) => {
                const buildingCode = code as BuildingCode
                const Icon = details.icon
                const quote = village.building_quotes[buildingCode]
                const level = village.buildings[buildingCode] ?? 0
                const queued = queuedByBuilding[buildingCode] ?? 0
                const affordable = quote && quote.costs.wood <= village.resources.wood
                  && quote.costs.clay <= village.resources.clay
                  && quote.costs.iron <= village.resources.iron
                return <div className="building-row" key={code}>
                  <span className="building-icon"><Icon size={19} strokeWidth={1.6} /></span>
                  <span className="building-name">{details.label}</span>
                  <span className="building-level">Stufe <strong>{level}</strong>{queued > 0 && <small> +{queued} vorgemerkt</small>}</span>
                  <span className="building-cost" aria-label={quote ? `Holz ${quote.costs.wood}, Lehm ${quote.costs.clay}, Eisen ${quote.costs.iron}` : 'Ausbaukosten nicht verfügbar'}>{quote ? `H ${quote.costs.wood} · L ${quote.costs.clay} · E ${quote.costs.iron}` : 'Kosten nicht verfügbar'}</span>
                  <span className="building-time"><Clock3 size={12} />{quote ? formatDuration(quote.build_seconds) : '—'}</span>
                  <button type="button" className="upgrade-button" onClick={() => void startBuildingUpgrade(buildingCode)} disabled={!quote || !affordable || !!upgrading || quote.target_level > 20} aria-label={`${details.label} auf Stufe ${quote?.target_level ?? '—'} ausbauen`}>
                    <ArrowUp size={14} />{upgrading === buildingCode ? 'Wird gebaut' : quote?.target_level && quote.target_level > 20 ? 'Maximal' : 'Ausbauen'}
                  </button>
                </div>
              })}</div>
              <section className="construction-section">
                <div className="section-title"><div><p className="eyebrow">BAUWESEN</p><h2>Laufende Bauaufträge</h2></div><span>{village.construction_queue.length} IN WARTESCHLANGE</span></div>
                {village.construction_queue.length === 0 ? <p className="queue-empty">Noch keine Bauaufträge. Wähle bei einem Gebäude „Ausbauen“.</p> : <ol className="construction-list">{village.construction_queue.map((job) => {
                  const remaining = Math.max(0, job.remaining_seconds - elapsedSinceRefresh)
                  return <li key={job.id}><span className="building-icon"><Hammer size={17} /></span><span><strong>{BUILDINGS[job.building_code].label} · Stufe {job.target_level}</strong><small>Serverseitiger Bauauftrag</small></span><time dateTime={job.completes_at}><Clock3 size={13} />{formatDuration(remaining)}</time></li>
                })}</ol>}
              </section>
            </section>
          )}
        </main>
        <aside className="right-rail">
          {view === 'world' ? <>
            <div className="side-panel-heading"><div><p className="eyebrow">WELT I</p><h2>Ortskunde</h2></div><span className="world-index">I</span></div>
            <div className="coord-card"><span>AKTUELLE ANSICHT</span><strong>{center.x} <i>/</i> {center.y}</strong><small>Koordinaten der Kartenmitte</small></div>
            {selectedTile?.village_id ? <div className="location-detail"><span className={selectedTile.is_barbarian ? 'location-crest hostile' : ownedVillages.some((owned) => owned.id === selectedTile.village_id) ? 'location-crest friendly' : 'location-crest player-crest'}>{selectedTile.is_barbarian ? <Shield size={22} /> : <Castle size={22} />}</span><p className="eyebrow">{selectedTile.is_barbarian ? 'BARBARENSIEDLUNG' : ownedVillages.some((owned) => owned.id === selectedTile.village_id) ? 'DEIN DORF' : 'SPIELERDORF'}</p><h3>{selectedTile.village_name}</h3><dl><div><dt>Besitzer</dt><dd>{ownedVillages.some((owned) => owned.id === selectedTile.village_id) ? 'Du' : selectedTile.owner_name ?? 'Niemandsland'}</dd></div>{selectedTile.alliance_tag && <div><dt>Allianz</dt><dd>[{selectedTile.alliance_tag}]</dd></div>}<div><dt>Koordinaten</dt><dd>({selectedTile.x} | {selectedTile.y})</dd></div><div><dt>Punkte</dt><dd>{selectedTile.points?.toLocaleString('de-DE') ?? '—'}</dd></div>{selectedTile.has_movement && <div><dt>Bewegung</dt><dd>Eigene oder eingehende Truppenbewegung</dd></div>}</dl></div> : selectedTile ? <div className="location-detail empty-location"><span className="location-crest neutral"><MapIcon size={22} /></span><p className="eyebrow">UNBEWOHNTES FELD</p><h3>{terrainName(selectedTile.terrain)}</h3><dl><div><dt>Koordinaten</dt><dd>({selectedTile.x} | {selectedTile.y})</dd></div></dl></div> : <div className="detail-empty">Wähle ein Feld auf der Karte.</div>}
            <div className="legend-block"><p className="eyebrow">KARTENZEICHEN</p><div><span className="legend-dot home-dot"><Castle size={13} /></span><span>Eigenes Dorf</span></div><div><span className="legend-dot allied-dot"><Castle size={13} /></span><span>Allianz</span></div><div><span className="legend-dot player-dot"><i>◆</i></span><span>Spielerdorf</span></div><div><span className="legend-dot barbarian-dot"><Shield size={13} /></span><span>Barbarensiedlung</span></div><div><span className="legend-dot plain-dot" /><span>Freies Feld</span></div></div>
          </> : <>
            <div className="side-panel-heading"><div><p className="eyebrow">SIEDLUNG</p><h2>Bestand</h2></div><span className="world-index"><House size={17} /></span></div>
            <div className="coord-card"><span>STANDORT</span><strong>{coordinateLabel}</strong><small>Gemeinsame Welt · I</small></div>
            <div className="stock-list"><p className="eyebrow">LAGERBESTAND</p>{resources.map(({ key, label, value, rate, icon: Icon }) => <div key={key}><span><Icon size={16} />{label}</span><strong>{Math.floor(value).toLocaleString('de-DE')}{rate !== null && <small> · +{rate.toLocaleString('de-DE')}/h</small>}</strong></div>)}<small>Kapazität je Rohstoff {village.resources.storage_capacity.toLocaleString('de-DE')}</small><div className="population-stock"><span><Users size={16} />Bevölkerung</span><strong>{village.resources.population.toLocaleString('de-DE')} / {village.resources.population_capacity.toLocaleString('de-DE')}</strong></div></div>
            <div className="phase-card"><span className="phase-card-mark"><Crown size={18} /></span><p className="eyebrow">WIRTSCHAFT · PHASE B</p><strong>Dein Dorf wächst.</strong><p>Rohstoffe reifen serverseitig nach. Lager und Bauernhof bestimmen die Kapazitäten; Bauaufträge werden zuverlässig auf dem Server abgerechnet.</p></div>
          </>}
          <div className="world-footer"><span>KÖNIGSLANDE · WELT I</span><span>PHASE E</span></div>
        </aside>
      </div>
    </div>
  )
}

function terrainName(terrain: WorldTile['terrain']) {
  return { plains: 'Wiesenland', forest: 'Waldgebiet', hills: 'Hügelland', marsh: 'Moorland' }[terrain]
}
