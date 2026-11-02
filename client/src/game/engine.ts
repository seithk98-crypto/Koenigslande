export type ResourceKey = 'wood' | 'clay' | 'iron' | 'food'

export type ResourceBag = Record<ResourceKey, number>

export type BuildingCode =
  | 'headquarters'
  | 'woodcutter'
  | 'clay_pit'
  | 'iron_mine'
  | 'farm'
  | 'warehouse'
  | 'barracks'
  | 'smithy'
  | 'stable'
  | 'workshop'
  | 'market'
  | 'rally_point'

export type UnitCode = 'spear' | 'sword' | 'axe' | 'archer' | 'light_cavalry' | 'heavy_cavalry'

export type PopulationState = {
  used: number
  capacity: number
  available: number
}

export type BuildingQueueItem = {
  id: string
  buildingCode: BuildingCode
  targetLevel: number
  startedAt: number
  completesAt: number
  cost: ResourceBag
}

export type Village = {
  id: string
  name: string
  x: number
  y: number
  owner: string
  resources: ResourceBag
  population: PopulationState
  buildings: Record<BuildingCode, number>
  buildingQueue: BuildingQueueItem[]
  units: Record<UnitCode, number>
}

export type WorldVillage = {
  id: string
  name: string
  x: number
  y: number
  type: 'home' | 'barbarian' | 'player'
  owner?: string
  points: number
  description: string
}

export type AttackState = {
  id: string
  fromVillageId: string
  toVillageId: string
  units: Record<UnitCode, number>
  startedAt: number
  arrivesAt: number
  status: 'traveling' | 'resolved'
}

export type GameState = {
  playerName: string
  villages: Village[]
  world: WorldVillage[]
  attacks: AttackState[]
  lastUpdated: number
}

export type ActionResult = {
  ok: boolean
  reason?: string
}

const BUILDING_DEFINITIONS: Record<
  BuildingCode,
  { name: string; maxLevel: number; cost: (level: number) => ResourceBag; production: (level: number) => Partial<ResourceBag> }
> = {
  headquarters: {
    name: 'Hauptgebäude',
    maxLevel: 20,
    cost: (level) => ({ wood: 100 + level * 45, clay: 120 + level * 50, iron: 60 + level * 30, food: 0 }),
    production: (level) => ({ food: 8 + level * 2 }),
  },
  woodcutter: {
    name: 'Holzfäller',
    maxLevel: 15,
    cost: (level) => ({ wood: 80 + level * 32, clay: 40 + level * 18, iron: 10 + level * 8, food: 0 }),
    production: (level) => ({ wood: 28 + 5 * level }),
  },
  clay_pit: {
    name: 'Lehmgrube',
    maxLevel: 15,
    cost: (level) => ({ wood: 70 + level * 28, clay: 90 + level * 35, iron: 20 + level * 12, food: 0 }),
    production: (level) => ({ clay: 22 + 5 * level }),
  },
  iron_mine: {
    name: 'Eisenmine',
    maxLevel: 15,
    cost: (level) => ({ wood: 90 + level * 38, clay: 60 + level * 24, iron: 30 + level * 18, food: 0 }),
    production: (level) => ({ iron: 18 + 4 * level }),
  },
  farm: {
    name: 'Bauernhof',
    maxLevel: 20,
    cost: (level) => ({ wood: 65 + level * 28, clay: 55 + level * 22, iron: 20 + level * 10, food: 0 }),
    production: (level) => ({ food: 12 + 4 * level }),
  },
  warehouse: {
    name: 'Speicher',
    maxLevel: 20,
    cost: (level) => ({ wood: 100 + level * 40, clay: 120 + level * 42, iron: 50 + level * 25, food: 0 }),
    production: () => ({}),
  },
  barracks: {
    name: 'Kaserne',
    maxLevel: 20,
    cost: (level) => ({ wood: 120 + level * 48, clay: 100 + level * 40, iron: 80 + level * 30, food: 0 }),
    production: () => ({}),
  },
  smithy: {
    name: 'Schmiede',
    maxLevel: 15,
    cost: (level) => ({ wood: 90 + level * 34, clay: 80 + level * 32, iron: 100 + level * 45, food: 0 }),
    production: () => ({}),
  },
  stable: {
    name: 'Stall',
    maxLevel: 15,
    cost: (level) => ({ wood: 110 + level * 38, clay: 90 + level * 30, iron: 80 + level * 28, food: 0 }),
    production: () => ({}),
  },
  workshop: {
    name: 'Werkstatt',
    maxLevel: 15,
    cost: (level) => ({ wood: 130 + level * 60, clay: 120 + level * 42, iron: 100 + level * 35, food: 0 }),
    production: () => ({}),
  },
  market: {
    name: 'Marktplatz',
    maxLevel: 10,
    cost: (level) => ({ wood: 70 + level * 30, clay: 90 + level * 35, iron: 60 + level * 26, food: 0 }),
    production: () => ({}),
  },
  rally_point: {
    name: 'Versammlungsplatz',
    maxLevel: 15,
    cost: (level) => ({ wood: 80 + level * 26, clay: 70 + level * 26, iron: 40 + level * 18, food: 0 }),
    production: () => ({}),
  },
}

const UNIT_DEFINITIONS = {
  spear: { name: 'Speerträger', popCost: 1, wood: 10, clay: 15, iron: 5, attack: 10, defense: 12, speed: 16 },
  sword: { name: 'Schwertkämpfer', popCost: 2, wood: 20, clay: 25, iron: 15, attack: 18, defense: 20, speed: 14 },
  axe: { name: 'Axtkämpfer', popCost: 2, wood: 18, clay: 12, iron: 18, attack: 24, defense: 14, speed: 15 },
  archer: { name: 'Bogenschütze', popCost: 2, wood: 25, clay: 15, iron: 18, attack: 17, defense: 12, speed: 13 },
  light_cavalry: { name: 'Leichte Kavallerie', popCost: 3, wood: 35, clay: 25, iron: 30, attack: 28, defense: 18, speed: 30 },
  heavy_cavalry: { name: 'Schwere Kavallerie', popCost: 5, wood: 60, clay: 48, iron: 72, attack: 42, defense: 31, speed: 22 },
} as const

function createVillage(id: string, name: string, x: number, y: number): Village {
  const buildings = {
    headquarters: 1,
    woodcutter: 1,
    clay_pit: 1,
    iron_mine: 1,
    farm: 1,
    warehouse: 1,
    barracks: 1,
    smithy: 1,
    stable: 1,
    workshop: 1,
    market: 1,
    rally_point: 1,
  } satisfies Record<BuildingCode, number>

  const population = getPopulationState(buildings, {
    spear: 0,
    sword: 0,
    axe: 0,
    archer: 0,
    light_cavalry: 0,
    heavy_cavalry: 0,
  })

  return {
    id,
    name,
    x,
    y,
    owner: 'spieler',
    resources: {
      wood: 220,
      clay: 190,
      iron: 170,
      food: 150,
    },
    population,
    buildings,
    buildingQueue: [],
    units: {
      spear: 10,
      sword: 6,
      axe: 4,
      archer: 5,
      light_cavalry: 0,
      heavy_cavalry: 0,
    },
  }
}

function getPopulationState(buildings: Record<BuildingCode, number>, units: Record<UnitCode, number>): PopulationState {
  const farmBoost = buildings.farm * 12
  const capacity = 30 + farmBoost + buildings.headquarters * 8 + buildings.warehouse * 6
  const used = Object.entries(units).reduce((total, [code, quantity]) => total + (UNIT_DEFINITIONS[code as UnitCode]?.popCost ?? 0) * quantity, 0)

  return {
    used,
    capacity,
    available: Math.max(0, capacity - used),
  }
}

export function createInitialGameState(playerName = 'Neuer Herrscher'): GameState {
  const village = createVillage('v1', 'Mutterdorf', 0, 0)

  const world: WorldVillage[] = [
    { id: 'home-v1', name: 'Mutterdorf', x: 0, y: 0, type: 'home', owner: playerName, points: 100, description: 'Das Zentrum deines Königreichs.' },
    { id: 'barb-1', name: 'Wolfsbruch', x: 3, y: 2, type: 'barbarian', points: 140, description: 'Ein freches Barbarendorf am Waldrand.' },
    { id: 'barb-2', name: 'Eichenwacht', x: -4, y: 5, type: 'barbarian', points: 180, description: 'Eine gut befestigte Siedlung mit steinernen Mauern.' },
    { id: 'barb-3', name: 'Moorstein', x: 5, y: -3, type: 'barbarian', points: 120, description: 'Ein kleiner Außenposten, leicht zu überfallen.' },
  ]

  return {
    playerName,
    villages: [village],
    world,
    attacks: [],
    lastUpdated: Date.now(),
  }
}

export function getBuildingUpgradeCost(code: BuildingCode, level: number): ResourceBag {
  const definition = BUILDING_DEFINITIONS[code]
  if (!definition) return { wood: 0, clay: 0, iron: 0, food: 0 }
  return definition.cost(level)
}

export function resolveVillagePopulation(village: Village) {
  village.population = getPopulationState(village.buildings, village.units)
}

export function townProductionPerHour(village: Village): ResourceBag {
  const totals: ResourceBag = { wood: 0, clay: 0, iron: 0, food: 0 }

  for (const [code, level] of Object.entries(village.buildings) as [BuildingCode, number][]) {
    const definition = BUILDING_DEFINITIONS[code]
    if (!definition || level <= 0) continue

    const production = definition.production(level)
    totals.wood += Number(production.wood ?? 0)
    totals.clay += Number(production.clay ?? 0)
    totals.iron += Number(production.iron ?? 0)
    totals.food += Number(production.food ?? 0)
  }

  return totals
}

export function startBuildingUpgrade(state: GameState, villageId: string, buildingCode: BuildingCode): ActionResult {
  const village = state.villages.find((entry) => entry.id === villageId)
  if (!village) {
    return { ok: false, reason: 'Dorf nicht gefunden.' }
  }

  if (village.buildingQueue.length > 0) {
    return { ok: false, reason: 'Es läuft bereits ein Bauvorhaben.' }
  }

  const currentLevel = village.buildings[buildingCode] ?? 0
  const definition = BUILDING_DEFINITIONS[buildingCode]
  if (!definition) return { ok: false, reason: 'Gebäude unbekannt.' }

  if (currentLevel >= definition.maxLevel) {
    return { ok: false, reason: 'Das Gebäude ist bereits auf Maximalstufe.' }
  }

  const cost = getBuildingUpgradeCost(buildingCode, currentLevel + 1)
  const canAfford = cost.wood <= village.resources.wood && cost.clay <= village.resources.clay && cost.iron <= village.resources.iron

  if (!canAfford) {
    return { ok: false, reason: 'Nicht genug Rohstoffe für den Ausbau.' }
  }

  village.resources.wood -= cost.wood
  village.resources.clay -= cost.clay
  village.resources.iron -= cost.iron

  const startedAt = Date.now()
  const completesAt = startedAt + (90 + currentLevel * 35) * 1000

  village.buildingQueue.push({
    id: `${buildingCode}-${Date.now()}`,
    buildingCode,
    targetLevel: currentLevel + 1,
    startedAt,
    completesAt,
    cost,
  })

  return { ok: true }
}

export function tickResources(state: GameState, seconds: number) {
  if (seconds <= 0) return state

  const tickMs = seconds * 1000

  for (const village of state.villages) {
    const production = townProductionPerHour(village)

    village.resources.wood += production.wood * (seconds / 3600)
    village.resources.clay += production.clay * (seconds / 3600)
    village.resources.iron += production.iron * (seconds / 3600)
    village.resources.food += production.food * (seconds / 3600)

    const completedQueue: BuildingQueueItem[] = []
    for (const item of village.buildingQueue) {
      if (item.completesAt <= Date.now() + tickMs) {
        village.buildings[item.buildingCode] = item.targetLevel
        completedQueue.push(item)
      }
    }

    village.buildingQueue = village.buildingQueue.filter((item) => !completedQueue.includes(item))
    resolveVillagePopulation(village)
  }

  for (const attack of state.attacks) {
    if (attack.status === 'traveling' && attack.arrivesAt <= Date.now()) {
      attack.status = 'resolved'
    }
  }

  state.lastUpdated = Date.now()
  return state
}

export function recruitUnits(state: GameState, villageId: string, unitCode: UnitCode, quantity: number): ActionResult {
  const village = state.villages.find((entry) => entry.id === villageId)
  if (!village) return { ok: false, reason: 'Dorf nicht gefunden.' }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, reason: 'Ungültige Anzahl.' }
  }

  const definition = UNIT_DEFINITIONS[unitCode]
  if (!definition) return { ok: false, reason: 'Einheit unbekannt.' }

  const requiredPopulation = definition.popCost * quantity
  if (village.population.available < requiredPopulation) {
    return { ok: false, reason: 'Nicht genug freie Bevölkerung.' }
  }

  const costWood = definition.wood * quantity
  const costClay = definition.clay * quantity
  const costIron = definition.iron * quantity

  if (village.resources.wood < costWood || village.resources.clay < costClay || village.resources.iron < costIron) {
    return { ok: false, reason: 'Nicht genug Rohstoffe.' }
  }

  village.resources.wood -= costWood
  village.resources.clay -= costClay
  village.resources.iron -= costIron
  village.units[unitCode] += quantity
  resolveVillagePopulation(village)

  return { ok: true }
}

export function startAttack(state: GameState, originVillageId: string, targetVillageId: string, unitSelections: Record<UnitCode, number>): ActionResult {
  const origin = state.villages.find((entry) => entry.id === originVillageId)
  const target = state.world.find((entry) => entry.id === targetVillageId)

  if (!origin || !target) return { ok: false, reason: 'Ziel oder Herkunft ungültig.' }

  const units: Record<UnitCode, number> = {
    spear: 0,
    sword: 0,
    axe: 0,
    archer: 0,
    light_cavalry: 0,
    heavy_cavalry: 0,
  }

  let totalUnits = 0
  for (const [unitCode, quantity] of Object.entries(unitSelections) as [UnitCode, number][]) {
    if (!UNIT_DEFINITIONS[unitCode] || quantity <= 0) continue
    if (origin.units[unitCode] < quantity) {
      return { ok: false, reason: `Nicht genügend ${UNIT_DEFINITIONS[unitCode].name}.` }
    }
    units[unitCode] = quantity
    totalUnits += quantity
  }

  if (totalUnits <= 0) return { ok: false, reason: 'Wähle mindestens eine Einheit aus.' }

  for (const [unitCode, quantity] of Object.entries(units) as [UnitCode, number][]) {
    origin.units[unitCode] -= quantity
  }

  const distance = Math.max(1, Math.round(Math.hypot(target.x - origin.x, target.y - origin.y)))
  const travelMs = (20 + distance * 10) * 1000

  state.attacks.push({
    id: `attack-${Date.now()}`,
    fromVillageId: originVillageId,
    toVillageId: targetVillageId,
    units,
    startedAt: Date.now(),
    arrivesAt: Date.now() + travelMs,
    status: 'traveling',
  })

  return { ok: true }
}

export function getVillageProductionDisplay(village: Village) {
  const production = townProductionPerHour(village)
  return {
    wood: Number(production.wood.toFixed(1)),
    clay: Number(production.clay.toFixed(1)),
    iron: Number(production.iron.toFixed(1)),
    food: Number(production.food.toFixed(1)),
  }
}

export function getBuildingName(code: BuildingCode) {
  return BUILDING_DEFINITIONS[code]?.name ?? code
}
