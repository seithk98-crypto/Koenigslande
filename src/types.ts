export type ResourceStock = {
  wood: number
  clay: number
  iron: number
  food: number
  storage_capacity: number
  population: number
  population_capacity: number
}

export type BuildingCost = Pick<ResourceStock, 'wood' | 'clay' | 'iron'>

export type BuildingQuote = {
  target_level: number
  costs: BuildingCost
  build_seconds: number
}

export type ConstructionJob = {
  id: string
  building_code: BuildingCode
  target_level: number
  started_at: string
  completes_at: string
  remaining_seconds: number
}

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

export type UnitCode =
  | 'spearman'
  | 'swordsman'
  | 'axeman'
  | 'scout'
  | 'light_cavalry'
  | 'heavy_cavalry'
  | 'ram'
  | 'catapult'
  | 'noble'

export type UnitDefinition = {
  unit_code: UnitCode
  name: string
  category: 'Infanterie' | 'Kavallerie' | 'Belagerung'
  attack: number
  defense_infantry: number
  defense_cavalry: number
  speed_minutes_per_field: number
  carry_capacity: number
  population_cost: number
  costs: BuildingCost
  recruit_seconds: number
  facility: Extract<BuildingCode, 'barracks' | 'stable' | 'workshop'>
  prerequisites: Partial<Record<BuildingCode, number>>
  unlocked: boolean
}

export type RecruitmentJob = {
  id: string
  unit_code: UnitCode
  quantity: number
  started_at: string
  completes_at: string
  status: 'queued'
  remaining_seconds: number
}

export type MovementSource = {
  id: string
  name: string
  x: number
  y: number
  troops: Record<UnitCode, number>
}

export type MovementTarget = {
  id: string
  name: string
  x: number
  y: number
  owner_name: string | null
  is_barbarian: boolean
}

export type TroopMovement = {
  id: string
  movement_type: 'attack' | 'scout' | 'return'
  status: 'travelling' | 'returning'
  source_village_id: string
  source_name: string
  source_x: number
  source_y: number
  target_village_id: string
  target_name: string
  target_x: number
  target_y: number
  troops: Partial<Record<UnitCode, number>> | null
  arrives_at: string
  remaining_seconds: number
  is_incoming: boolean
}

export type CombatReport = {
  id: string
  movement_id: string
  report_type: 'combat' | 'scout'
  report_data: Record<string, unknown>
  created_at: string
}

export type MovementOverview = {
  sources: MovementSource[]
  targets: MovementTarget[]
  movements: TroopMovement[]
  reports: CombatReport[]
}

export type Village = {
  id: string
  world_id: string
  name: string
  x: number
  y: number
  points: number
  resources: ResourceStock
  buildings: Partial<Record<BuildingCode, number>>
  production_per_hour: Pick<ResourceStock, 'wood' | 'clay' | 'iron'>
  construction_queue: ConstructionJob[]
  building_quotes: Record<BuildingCode, BuildingQuote>
  troops: Record<UnitCode, number>
  units: UnitDefinition[]
  recruitment_queue: RecruitmentJob[]
  recruitment_time_factor: number
}

export type WorldTile = {
  x: number
  y: number
  terrain: 'plains' | 'forest' | 'hills' | 'marsh'
  village_id: string | null
  village_name: string | null
  owner_name: string | null
  points: number | null
  is_barbarian: boolean | null
  alliance_tag: string | null
  has_movement: boolean
}

export type MultiplayerProfile = {
  id: string
  username: string
  avatar_url: string | null
  description: string
  created_at: string
  points: number
  village_count: number
  alliance_id: string | null
  alliance_name: string | null
  alliance_tag: string | null
}

export type AllianceMember = {
  id: string
  username: string
  avatar_url: string | null
  role: 'founder' | 'leader' | 'diplomat' | 'member'
  joined_at: string
  points: number
  village_count: number
}

export type AllianceSummary = {
  id: string
  name: string
  tag: string
  description: string
  member_count: number
  points: number
}

export type AllianceInvitation = {
  id: string
  alliance_id: string
  alliance_name: string
  alliance_tag: string
  inviter_name: string
  created_at: string
}

export type DiplomaticRelation = {
  id: string
  relation_type: 'alliance' | 'non_aggression' | 'war'
  status: 'pending' | 'active'
  initiator_alliance_id: string
  own_side: 'low' | 'high'
  other_alliance_id: string
  other_alliance_name: string
  other_alliance_tag: string
  created_at: string
}

export type PrivateMessage = {
  id: string
  sender_id: string
  sender_name: string
  recipient_id: string
  recipient_name: string
  body: string
  created_at: string
  read_at: string | null
}

export type AllianceMessage = {
  id: string
  sender_id: string
  sender_name: string
  body: string
  created_at: string
}

export type MultiplayerNotification = {
  id: string
  event_type: string
  created_at: string
  read_at: string | null
}

export type AllianceDetails = {
  id: string
  name: string
  tag: string
  description: string
  role: AllianceMember['role']
  founder_id: string
  members: AllianceMember[]
  messages: AllianceMessage[]
}

export type MultiplayerOverview = {
  profile: MultiplayerProfile
  alliance: AllianceDetails | null
  alliances: AllianceSummary[]
  invitations: AllianceInvitation[]
  diplomacy: DiplomaticRelation[]
  messages: PrivateMessage[]
  notifications: MultiplayerNotification[]
}

export type PlayerRanking = {
  id: string
  username: string
  avatar_url: string | null
  points: number
  village_count: number
  alliance_tag: string | null
}

export type AllianceRanking = {
  id: string
  name: string
  tag: string
  points: number
  member_count: number
}

export type VillageRanking = {
  id: string
  name: string
  x: number
  y: number
  points: number
  owner_name: string
  alliance_tag: string | null
}

export type PlayerRankings = {
  players: PlayerRanking[]
  alliances: AllianceRanking[]
  villages: VillageRanking[]
}