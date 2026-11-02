import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { readLocalSupabaseConfig } from './local-supabase.mjs'

const { apiUrl, anonKey, serviceRoleKey } = readLocalSupabaseConfig()
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } }
const userClient = createClient(apiUrl, anonKey, clientOptions)
const adminClient = createClient(apiUrl, serviceRoleKey, clientOptions)
const email = `phase-c-${randomUUID()}@example.test`
const password = `Phase-C-${randomUUID()}!`
let userId
let villageId
let secondVillageId
let testFailure

try {
  const { data: signup, error: signupError } = await userClient.auth.signUp({
    email,
    password,
    options: { data: { display_name: 'Heerführer' } },
  })
  assert.ifError(signupError)
  assert.ok(signup.session, 'local signup should return an authenticated session')
  userId = signup.user?.id
  assert.ok(userId, 'signup should return a user id')

  const { data: founded, error: foundingError } = await userClient.rpc('found_starting_village', { p_name: 'Schildwacht' })
  assert.ifError(foundingError)
  villageId = founded.id

  async function getVillageState(id = villageId) {
    const { data, error } = await userClient.rpc('get_village_state', { p_village_id: id })
    assert.ifError(error)
    assert.ok(data, 'owned village should return its state')
    return data
  }

  const initial = await getVillageState()
  assert.equal(initial.units.length, 9)
  assert.equal(initial.troops.spearman, 0)
  assert.equal(initial.recruitment_queue.length, 0)
  assert.equal(initial.units.find((unit) => unit.unit_code === 'spearman').unlocked, true)
  assert.equal(initial.units.find((unit) => unit.unit_code === 'swordsman').unlocked, false)

  const lockedRequest = await userClient.rpc('start_recruitment', {
    p_village_id: villageId,
    p_unit_code: 'swordsman',
    p_quantity: 1,
    p_request_id: randomUUID(),
  })
  assert.match(lockedRequest.error?.message ?? '', /Voraussetzungen/)

  const { error: emptyResourcesError } = await adminClient.from('village_resources').update({
    wood: 0,
    clay: 0,
    iron: 0,
  }).eq('village_id', villageId)
  assert.ifError(emptyResourcesError)
  const poorRecruitment = await userClient.rpc('start_recruitment', {
    p_village_id: villageId,
    p_unit_code: 'spearman',
    p_quantity: 1,
    p_request_id: randomUUID(),
  })
  assert.match(poorRecruitment.error?.message ?? '', /Nicht genügend Rohstoffe/)

  const { error: seedForPopulationError } = await adminClient.from('village_resources').update({
    wood: 10000,
    clay: 10000,
    iron: 10000,
    population: 239,
  }).eq('village_id', villageId)
  assert.ifError(seedForPopulationError)
  const crowdedRecruitment = await userClient.rpc('start_recruitment', {
    p_village_id: villageId,
    p_unit_code: 'spearman',
    p_quantity: 2,
    p_request_id: randomUUID(),
  })
  assert.match(crowdedRecruitment.error?.message ?? '', /Nicht genügend freie Bevölkerung/)

  const { error: populationCapacityError } = await adminClient.from('village_resources').update({
    population: 100,
  }).eq('village_id', villageId)
  assert.ifError(populationCapacityError)

  const spearRequestId = randomUUID()
  const duplicateRecruitment = await Promise.all([
    userClient.rpc('start_recruitment', {
      p_village_id: villageId,
      p_unit_code: 'spearman',
      p_quantity: 2,
      p_request_id: spearRequestId,
    }),
    userClient.rpc('start_recruitment', {
      p_village_id: villageId,
      p_unit_code: 'spearman',
      p_quantity: 2,
      p_request_id: spearRequestId,
    }),
  ])
  for (const result of duplicateRecruitment) assert.ifError(result.error)
  assert.equal(duplicateRecruitment[0].data.recruitment_queue.length, 1)
  assert.equal(duplicateRecruitment[1].data.recruitment_queue.length, 1)
  assert.equal(duplicateRecruitment[1].data.resources.wood, 900, 'same request must not charge resources twice')
  assert.equal(duplicateRecruitment[1].data.resources.population, 102, 'population is reserved while training')
  assert.equal(duplicateRecruitment[1].data.troops.spearman, 0, 'units are only credited after training')
  assert.equal(duplicateRecruitment[1].data.recruitment_queue[0].quantity, 2)

  const { error: enablePrerequisitesError } = await adminClient.from('village_buildings').update({ level: 4 })
    .eq('village_id', villageId)
    .in('building_code', ['barracks', 'smithy', 'stable', 'workshop'])
  assert.ifError(enablePrerequisitesError)
  const enabled = await getVillageState()
  assert.equal(enabled.units.filter((unit) => unit.unit_code !== 'noble').every((unit) => unit.unlocked), true, 'building requirements unlock their matching unit classes')
  assert.equal(enabled.units.find((unit) => unit.unit_code === 'noble').unlocked, false, 'a noble requires a high-level headquarters and stable')

  const catapult = enabled.units.find((unit) => unit.unit_code === 'catapult')
  assert.ok(catapult)
  const { error: costRaceSeedError } = await adminClient.from('village_resources').update({
    wood: catapult.costs.wood,
    clay: catapult.costs.clay,
    iron: catapult.costs.iron,
  }).eq('village_id', villageId)
  assert.ifError(costRaceSeedError)

  const raceRequestIds = [randomUUID(), randomUUID()]
  const competingRecruitments = await Promise.all(raceRequestIds.map((requestId) =>
    userClient.rpc('start_recruitment', {
      p_village_id: villageId,
      p_unit_code: 'catapult',
      p_quantity: 1,
      p_request_id: requestId,
    }),
  ))
  const successfulIndex = competingRecruitments.findIndex((result) => !result.error)
  assert.notEqual(successfulIndex, -1, 'one affordable parallel recruitment should succeed')
  assert.match(competingRecruitments[1 - successfulIndex].error?.message ?? '', /Nicht genügend Rohstoffe/)
  const catapultRequestId = raceRequestIds[successfulIndex]
  assert.equal(competingRecruitments[successfulIndex].data.recruitment_queue.length, 2)
  assert.equal(competingRecruitments[successfulIndex].data.resources.population, 110)

  const pastCompletion = Date.now() - 30 * 60 * 1000
  const { error: backdateSpearError } = await adminClient.from('recruitment_queue').update({
    started_at: new Date(pastCompletion - 120 * 1000).toISOString(),
    completes_at: new Date(pastCompletion).toISOString(),
  }).eq('village_id', villageId).eq('request_id', spearRequestId)
  assert.ifError(backdateSpearError)
  const { error: backdateCatapultError } = await adminClient.from('recruitment_queue').update({
    started_at: new Date(pastCompletion).toISOString(),
    completes_at: new Date(pastCompletion + 120 * 1000).toISOString(),
  }).eq('village_id', villageId).eq('request_id', catapultRequestId)
  assert.ifError(backdateCatapultError)

  const completedState = await getVillageState()
  assert.equal(completedState.troops.spearman, 2, 'offline completed units must be credited')
  assert.equal(completedState.troops.catapult, 1)
  assert.equal(completedState.recruitment_queue.length, 0, 'finished recruitment jobs leave the active queue')
  assert.equal(completedState.resources.population, 110, 'population stays assigned to trained units')

  const { data: released, error: releaseError } = await userClient.rpc('release_troops', {
    p_village_id: villageId,
    p_unit_code: 'spearman',
    p_quantity: 1,
  })
  assert.ifError(releaseError)
  assert.equal(released.troops.spearman, 1)
  assert.equal(released.resources.population, 109, 'disbanding troops releases their population')

  const { data: otherTile, error: tileError } = await adminClient.from('world_tiles').select('x,y')
    .eq('world_id', '00000000-0000-0000-0000-000000000001')
    .eq('x', 90)
    .eq('y', -90)
    .single()
  assert.ifError(tileError)
  const { data: secondVillage, error: secondVillageError } = await adminClient.from('villages').insert({
    world_id: '00000000-0000-0000-0000-000000000001',
    owner_id: userId,
    name: 'Falkenhorst',
    x: otherTile.x,
    y: otherTile.y,
    points: 100,
    is_barbarian: false,
  }).select('id').single()
  assert.ifError(secondVillageError)
  secondVillageId = secondVillage.id
  const { error: secondResourcesError } = await adminClient.from('village_resources').insert({
    village_id: secondVillageId,
    wood: 1000,
    clay: 1000,
    iron: 1000,
    food: 300,
    population: 100,
    population_capacity: 240,
    storage_capacity: 1000,
  })
  assert.ifError(secondResourcesError)
  const { error: secondBuildingsError } = await adminClient.from('village_buildings').insert([
    { village_id: secondVillageId, building_code: 'headquarters', level: 1 },
    { village_id: secondVillageId, building_code: 'barracks', level: 1 },
  ])
  assert.ifError(secondBuildingsError)

  const secondVillageState = await getVillageState(secondVillageId)
  assert.equal(secondVillageState.troops.spearman, 0, 'each village has a separate troop inventory')
  const secondVillageRecruitment = await userClient.rpc('start_recruitment', {
    p_village_id: secondVillageId,
    p_unit_code: 'spearman',
    p_quantity: 1,
    p_request_id: randomUUID(),
  })
  assert.ifError(secondVillageRecruitment.error)
  assert.equal(secondVillageRecruitment.data.resources.population, 101)
  assert.equal(secondVillageRecruitment.data.troops.spearman, 0)
  const secondVillageRequestId = secondVillageRecruitment.data.recruitment_queue[0].id
  const { error: completeSecondRecruitmentError } = await adminClient.from('recruitment_queue').update({
    started_at: new Date(Date.now() - 120 * 1000).toISOString(),
    completes_at: new Date(Date.now() - 60 * 1000).toISOString(),
  }).eq('id', secondVillageRequestId)
  assert.ifError(completeSecondRecruitmentError)
  const completedSecondVillageState = await getVillageState(secondVillageId)
  assert.equal(completedSecondVillageState.troops.spearman, 1, 'completed troops must be credited to their recruiting village')
  assert.equal(completedSecondVillageState.recruitment_queue.length, 0)
  const { data: wrongVillageAccess, error: ownershipError } = await userClient.rpc('get_village_state', {
    p_village_id: '00000000-0000-0000-0000-000000000009',
  })
  assert.equal(wrongVillageAccess, null)
  assert.match(ownershipError?.message ?? '', /Eigenes Dorf nicht gefunden/)

  const firstVillageAfterSecondRecruit = await getVillageState(villageId)
  assert.equal(firstVillageAfterSecondRecruit.troops.spearman, 1, 'recruitment in another village must not mix inventories')
} catch (error) {
  testFailure = error
}

if (userId) {
  try {
    const { error } = await adminClient.auth.admin.deleteUser(userId)
    if (error) throw error
  } catch (error) {
    testFailure ??= error
  }
}

if (testFailure) throw testFailure
console.log('Phase-C Integration: locked units, resource and population limits, idempotency, concurrent requests, offline completion, population release and village isolation passed.')
