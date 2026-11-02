import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { readLocalSupabaseConfig } from './local-supabase.mjs'

const { apiUrl, anonKey, serviceRoleKey } = readLocalSupabaseConfig()
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } }
const userClient = createClient(apiUrl, anonKey, clientOptions)
const adminClient = createClient(apiUrl, serviceRoleKey, clientOptions)
const email = `phase-b-${randomUUID()}@example.test`
const password = `Phase-B-${randomUUID()}!`
let userId
let villageId
let requestId
let testFailure

try {
  const { data: signup, error: signupError } = await userClient.auth.signUp({
    email,
    password,
    options: { data: { display_name: 'Wirtschaftstest' } },
  })
  assert.ifError(signupError)
  assert.ok(signup.session, 'local signup should return an authenticated session')
  userId = signup.user?.id
  assert.ok(userId, 'signup should return a user id')

  const { data: founded, error: foundingError } = await userClient.rpc('found_starting_village', { p_name: 'Erlenwacht' })
  assert.ifError(foundingError)
  villageId = founded.id
  assert.equal(founded.resources.population, 100)
  assert.equal(founded.resources.population_capacity, 240)
  assert.equal(founded.resources.storage_capacity, 1000)
  assert.deepEqual(founded.production_per_hour, { wood: 30, clay: 30, iron: 30 })
  assert.deepEqual(founded.construction_queue, [])
  assert.deepEqual(founded.building_quotes.woodcutter, {
    target_level: 2,
    costs: { wood: 60, clay: 50, iron: 40 },
    build_seconds: 60,
  })

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { error: seedError } = await adminClient.from('village_resources').update({
    wood: 5000,
    clay: 0,
    iron: 0,
    wood_remainder: 0,
    clay_remainder: 0,
    iron_remainder: 0,
    economy_last_updated_at: oneHourAgo,
  }).eq('village_id', villageId)
  assert.ifError(seedError)

  const { data: settled, error: settlementError } = await userClient.rpc('get_my_starting_village')
  assert.ifError(settlementError)
  assert.equal(settled.resources.wood, 1000, 'production must clamp stock to the warehouse capacity')
  assert.equal(settled.resources.clay, 30, 'offline clay production should be applied')
  assert.equal(settled.resources.iron, 30, 'offline iron production should be applied')
  assert.ok(settled.resources.wood <= settled.resources.storage_capacity)
  assert.ok(settled.resources.clay <= settled.resources.storage_capacity)
  assert.ok(settled.resources.iron <= settled.resources.storage_capacity)

  const quote = settled.building_quotes.woodcutter
  const { error: costSeedError } = await adminClient.from('village_resources').update({
    wood: quote.costs.wood,
    clay: quote.costs.clay,
    iron: quote.costs.iron,
    wood_remainder: 0,
    clay_remainder: 0,
    iron_remainder: 0,
  }).eq('village_id', villageId)
  assert.ifError(costSeedError)

  requestId = randomUUID()
  const submissions = await Promise.all([
    userClient.rpc('start_building_upgrade', { p_building_code: 'woodcutter', p_request_id: requestId }),
    userClient.rpc('start_building_upgrade', { p_building_code: 'woodcutter', p_request_id: requestId }),
  ])
  for (const submission of submissions) assert.ifError(submission.error)
  assert.equal(submissions[0].data.construction_queue.length, 1, 'repeated request IDs must create only one construction')
  assert.equal(submissions[1].data.construction_queue.length, 1, 'concurrent retries must return the same queued construction')
  assert.equal(submissions[1].data.resources.wood, 0, 'the repeated request must not deduct resources twice')
  assert.equal(submissions[1].data.resources.clay, 0)
  assert.equal(submissions[1].data.resources.iron, 0)

  const competingCost = submissions[0].data.building_quotes.clay_pit.costs
  const { error: competingSeedError } = await adminClient.from('village_resources').update({
    wood: competingCost.wood,
    clay: competingCost.clay,
    iron: competingCost.iron,
    wood_remainder: 0,
    clay_remainder: 0,
    iron_remainder: 0,
  }).eq('village_id', villageId)
  assert.ifError(competingSeedError)

  const competingRequestIds = [randomUUID(), randomUUID()]
  const competingSubmissions = await Promise.all(competingRequestIds.map((id) =>
    userClient.rpc('start_building_upgrade', { p_building_code: 'clay_pit', p_request_id: id }),
  ))
  const successfulSubmissionIndex = competingSubmissions.findIndex((submission) => !submission.error)
  const rejectedSubmission = competingSubmissions[1 - successfulSubmissionIndex]
  assert.notEqual(successfulSubmissionIndex, -1, 'one affordable concurrent upgrade should succeed')
  assert.match(rejectedSubmission.error?.message ?? '', /Nicht genügend Rohstoffe/)
  const competingRequestId = competingRequestIds[successfulSubmissionIndex]
  const queuedAfterRace = competingSubmissions[successfulSubmissionIndex].data
  assert.equal(queuedAfterRace.construction_queue.length, 2, 'only one of two unaffordable parallel submissions may be added')
  assert.equal(queuedAfterRace.resources.wood, 0)
  assert.equal(queuedAfterRace.resources.clay, 0)
  assert.equal(queuedAfterRace.resources.iron, 0)

  const { data: unaffordable, error: unaffordableError } = await userClient.rpc('start_building_upgrade', {
    p_building_code: 'iron_mine',
    p_request_id: randomUUID(),
  })
  assert.equal(unaffordable, null)
  assert.match(unaffordableError?.message ?? '', /Nicht genügend Rohstoffe/)

  const pastCompletion = Date.now() - 30 * 60 * 1000
  const { error: woodQueueError } = await adminClient.from('construction_queue').update({
    started_at: new Date(pastCompletion - 60 * 1000).toISOString(),
    completes_at: new Date(pastCompletion).toISOString(),
  }).eq('village_id', villageId).eq('request_id', requestId)
  assert.ifError(woodQueueError)
  const { error: clayQueueError } = await adminClient.from('construction_queue').update({
    started_at: new Date(pastCompletion).toISOString(),
    completes_at: new Date(pastCompletion + 60 * 1000).toISOString(),
  }).eq('village_id', villageId).eq('request_id', competingRequestId)
  assert.ifError(clayQueueError)

  const { error: offlineSeedError } = await adminClient.from('village_resources').update({
    wood: 0,
    clay: 0,
    iron: 0,
    wood_remainder: 0,
    clay_remainder: 0,
    iron_remainder: 0,
    economy_last_updated_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  }).eq('village_id', villageId)
  assert.ifError(offlineSeedError)

  const { data: afterCompletion, error: completionError } = await userClient.rpc('get_my_starting_village')
  assert.ifError(completionError)
  assert.equal(afterCompletion.buildings.woodcutter, 2, 'a completed upgrade must be applied server-side')
  assert.equal(afterCompletion.buildings.clay_pit, 2, 'concurrent upgrade settlement must apply the winning request')
  assert.equal(afterCompletion.construction_queue.length, 0, 'completed jobs must leave the active queue')
  assert.equal(afterCompletion.resources.wood, 33, 'offline production must use the upgraded rate only after completion')
  assert.equal(afterCompletion.resources.clay, 32)
  assert.equal(afterCompletion.resources.iron, 30)

  const { data: completedRetry, error: retryError } = await userClient.rpc('start_building_upgrade', {
    p_building_code: 'woodcutter',
    p_request_id: requestId,
  })
  assert.ifError(retryError)
  assert.equal(completedRetry.construction_queue.length, 0, 'retrying a completed request must not create another upgrade')
  assert.equal(completedRetry.buildings.woodcutter, 2)
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
console.log('Phase-B Integration: offline production, storage caps, idempotent concurrent upgrades, resource costs and completion timing passed.')
