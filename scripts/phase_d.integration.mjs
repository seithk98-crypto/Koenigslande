import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { readLocalSupabaseConfig } from './local-supabase.mjs'

const { apiUrl, anonKey, serviceRoleKey } = readLocalSupabaseConfig()
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } }
const adminClient = createClient(apiUrl, serviceRoleKey, clientOptions)
const attackerClient = createClient(apiUrl, anonKey, clientOptions)
const defenderClient = createClient(apiUrl, anonKey, clientOptions)
const accountIds = []
let testFailure

try {
  async function createAccount(client, role) {
    const { data, error } = await client.auth.signUp({
      email: `phase-d-${role}-${randomUUID()}@example.test`,
      password: `Phase-D-${randomUUID()}!`,
      options: { data: { display_name: `Feldherr ${role}` } },
    })
    assert.ifError(error)
    assert.ok(data.session, `local ${role} signup should return an authenticated session`)
    assert.ok(data.user?.id, `${role} signup should return a user id`)
    accountIds.push(data.user.id)
    return data.user.id
  }

  const attackerId = await createAccount(attackerClient, 'Angreifer')
  const defenderId = await createAccount(defenderClient, 'Verteidiger')

  async function createVillage(ownerId, name, x, y, resources = {}) {
    const { data: village, error: villageError } = await adminClient.from('villages').insert({
      world_id: '00000000-0000-0000-0000-000000000001',
      owner_id: ownerId,
      name,
      x,
      y,
    }).select('id').single()
    assert.ifError(villageError)

    const { error: resourcesError } = await adminClient.from('village_resources').upsert({
      village_id: village.id,
      wood: 0,
      clay: 0,
      iron: 0,
      food: 0,
      storage_capacity: 1000,
      population: 0,
      population_capacity: 10000,
      ...resources,
      economy_last_updated_at: new Date().toISOString(),
    })
    assert.ifError(resourcesError)

    const { error: buildingsError } = await adminClient.from('village_buildings').insert([
      { village_id: village.id, building_code: 'rally_point', level: 1 },
    ])
    assert.ifError(buildingsError)
    return village.id
  }

  async function setTroops(villageId, troops) {
    const rows = Object.entries(troops).map(([unit_code, quantity]) => ({
      village_id: villageId,
      unit_code,
      quantity,
    }))
    const { error } = await adminClient.from('village_troops').upsert(rows)
    assert.ifError(error)
  }

  async function getOverview(client) {
    const { data, error } = await client.rpc('get_movement_overview')
    assert.ifError(error)
    assert.ok(data, 'authenticated movement overview should return data')
    return data
  }

  async function backdateMovement(movementId) {
    const sentAt = Date.now() - 10_000
    const { error } = await adminClient.from('troop_movements').update({
      sent_at: new Date(sentAt).toISOString(),
      arrives_at: new Date(sentAt + 5000).toISOString(),
    }).eq('id', movementId)
    assert.ifError(error)
  }

  async function settleReturn(client, parentMovementId) {
    const { data, error } = await adminClient.from('troop_movements').select('id')
      .eq('parent_movement_id', parentMovementId)
      .eq('movement_type', 'return')
      .single()
    assert.ifError(error)
    await backdateMovement(data.id)
    await getOverview(client)
    const { data: completed, error: completedError } = await adminClient.from('troop_movements')
      .select('status').eq('id', data.id).single()
    assert.ifError(completedError)
    assert.equal(completed.status, 'completed', 'offline return movement should complete once processed')
  }

  const sourceVillageId = await createVillage(attackerId, 'Schildwacht', 80, 80, {
    population: 2000,
    population_capacity: 10000,
  })
  const ownTargetVillageId = await createVillage(attackerId, 'Kronenhof', 81, 80)
  const concurrentSourceId = await createVillage(attackerId, 'Südwacht', 80, 82, {
    population: 100,
    population_capacity: 1000,
  })
  const targetVillageId = await createVillage(defenderId, 'Rabenfels', 83, 80, {
    wood: 500,
    clay: 500,
    iron: 500,
    population: 0,
    population_capacity: 10000,
  })
  await setTroops(sourceVillageId, { spearman: 100, scout: 10 })
  await setTroops(concurrentSourceId, { spearman: 10 })

  const ownedTarget = await attackerClient.rpc('send_troop_movement', {
    p_source_village_id: sourceVillageId,
    p_target_village_id: ownTargetVillageId,
    p_movement_type: 'attack',
    p_troops: { spearman: 1 },
    p_request_id: randomUUID(),
  })
  assert.match(ownedTarget.error?.message ?? '', /eigen|unbekannt/i)

  const insufficientTroops = await attackerClient.rpc('send_troop_movement', {
    p_source_village_id: sourceVillageId,
    p_target_village_id: targetVillageId,
    p_movement_type: 'attack',
    p_troops: { spearman: 101 },
    p_request_id: randomUUID(),
  })
  assert.match(insufficientTroops.error?.message ?? '', /Nicht genügend Einheiten/)

  const invalidTroops = await attackerClient.rpc('send_troop_movement', {
    p_source_village_id: sourceVillageId,
    p_target_village_id: targetVillageId,
    p_movement_type: 'attack',
    p_troops: { dragon: 1 },
    p_request_id: randomUUID(),
  })
  assert.match(invalidTroops.error?.message ?? '', /Unbekannter Einheitentyp/)

  const unauthorizedSource = await defenderClient.rpc('send_troop_movement', {
    p_source_village_id: sourceVillageId,
    p_target_village_id: targetVillageId,
    p_movement_type: 'attack',
    p_troops: { spearman: 1 },
    p_request_id: randomUUID(),
  })
  assert.match(unauthorizedSource.error?.message ?? '', /Ausgangsdorf gehört dir nicht/)

  const attackRequestId = randomUUID()
  const firstAttack = await attackerClient.rpc('send_troop_movement', {
    p_source_village_id: sourceVillageId,
    p_target_village_id: targetVillageId,
    p_movement_type: 'attack',
    p_troops: { spearman: 100 },
    p_request_id: attackRequestId,
  })
  assert.ifError(firstAttack.error)
  const attackMovement = firstAttack.data.movements.find((movement) => movement.source_village_id === sourceVillageId)
  assert.ok(attackMovement, 'outbound attack should be listed')
  assert.ok(attackMovement.remaining_seconds > 0, 'travel duration is server-calculated')

  const duplicateAttack = await attackerClient.rpc('send_troop_movement', {
    p_source_village_id: sourceVillageId,
    p_target_village_id: targetVillageId,
    p_movement_type: 'attack',
    p_troops: { spearman: 100 },
    p_request_id: attackRequestId,
  })
  assert.ifError(duplicateAttack.error)
  assert.equal(duplicateAttack.data.movements.filter((movement) => movement.id === attackMovement.id).length, 1)

  const incoming = await getOverview(defenderClient)
  const incomingAttack = incoming.movements.find((movement) => movement.id === attackMovement.id)
  assert.ok(incomingAttack?.is_incoming, 'defender sees the incoming movement')
  assert.equal(incomingAttack.troops, null, 'incoming movement overview does not leak enemy composition')

  await backdateMovement(attackMovement.id)
  const defenderAfterArrival = await getOverview(defenderClient)
  const defenderReport = defenderAfterArrival.reports.find((report) => report.movement_id === attackMovement.id)
  assert.ok(defenderReport, 'arrival resolves while the defender is the next user to make an RPC')
  assert.equal(defenderReport.report_type, 'combat')
  assert.equal(defenderReport.report_data.result, 'defeat')
  assert.equal('attacking_troops' in defenderReport.report_data, false, 'defender report hides attacker troop composition')
  assert.equal('attacker_losses' in defenderReport.report_data, false, 'defender report hides attacker losses')

  const attackerAfterArrival = await getOverview(attackerClient)
  const attackerReport = attackerAfterArrival.reports.find((report) => report.movement_id === attackMovement.id)
  assert.ok(attackerReport, 'attacker receives a persistent combat report')
  assert.equal(attackerReport.report_data.result, 'attacker', 'overwhelming force defeats passive fortification')
  assert.equal(attackerReport.report_data.defending_troops ? Object.keys(attackerReport.report_data.defending_troops).length : 0, 0)
  const attackerLosses = attackerReport.report_data.attacker_losses
  const attackerSurvivors = attackerReport.report_data.attacker_survivors
  assert.ok(attackerLosses.spearman > 0 && attackerLosses.spearman < 100)
  assert.equal(attackerLosses.spearman + attackerSurvivors.spearman, 100)
  const returnedCount = attackerSurvivors.spearman
  const loot = attackerReport.report_data.loot
  assert.ok(loot.wood + loot.clay + loot.iron <= returnedCount * 25, 'loot does not exceed surviving carry capacity')
  assert.ok(loot.wood + loot.clay + loot.iron > 0, 'victorious attackers receive available loot')

  const { data: resourcesAfterLoot, error: resourcesError } = await adminClient.from('village_resources')
    .select('village_id,wood,clay,iron,storage_capacity').in('village_id', [sourceVillageId, targetVillageId])
  assert.ifError(resourcesError)
  const attackerResources = resourcesAfterLoot.find((resources) => resources.village_id === sourceVillageId)
  const defenderResources = resourcesAfterLoot.find((resources) => resources.village_id === targetVillageId)
  assert.ok(attackerResources && defenderResources)
  for (const resource of ['wood', 'clay', 'iron']) {
    assert.ok(attackerResources[resource] >= 0 && attackerResources[resource] <= attackerResources.storage_capacity)
    assert.ok(defenderResources[resource] >= 0)
  }

  await settleReturn(attackerClient, attackMovement.id)
  const { data: returnedArmy, error: returnedArmyError } = await adminClient.from('village_troops')
    .select('quantity').eq('village_id', sourceVillageId).eq('unit_code', 'spearman').single()
  assert.ifError(returnedArmyError)
  assert.equal(returnedArmy.quantity, returnedCount, 'survivors return to the correct source village once')
  const repeatedOverview = await getOverview(attackerClient)
  assert.equal(repeatedOverview.reports.filter((report) => report.movement_id === attackMovement.id).length, 1)

  async function dispatchAndResolveSpy(targetId, label) {
    const { error: seedTroopsError } = await adminClient.from('village_troops').upsert({
      village_id: sourceVillageId,
      unit_code: 'scout',
      quantity: 10,
    })
    assert.ifError(seedTroopsError)
    const { error: populationError } = await adminClient.from('village_resources').update({
      population: 5000,
      population_capacity: 10000,
    }).eq('village_id', sourceVillageId)
    assert.ifError(populationError)

    const { data, error } = await attackerClient.rpc('send_troop_movement', {
      p_source_village_id: sourceVillageId,
      p_target_village_id: targetId,
      p_movement_type: 'scout',
      p_troops: { scout: 10 },
      p_request_id: randomUUID(),
    })
    assert.ifError(error)
    const outbound = data.movements.find((movement) =>
      movement.movement_type === 'scout' && movement.source_village_id === sourceVillageId,
    )
    assert.ok(outbound, `${label} scout movement should be listed`)
    await backdateMovement(outbound.id)
    const resolved = await getOverview(attackerClient)
    const report = resolved.reports.find((entry) => entry.movement_id === outbound.id)
    assert.ok(report, `${label} should produce a persistent scout report`)
    assert.equal(report.report_type, 'scout')
    await settleReturn(attackerClient, outbound.id)
    return report.report_data
  }

  let successfulSpy
  for (let attempt = 0; attempt < 30 && !successfulSpy; attempt += 1) {
    const report = await dispatchAndResolveSpy(targetVillageId, 'undefended')
    if (report.result === 'success') successfulSpy = report
  }
  assert.ok(successfulSpy, 'spying succeeds within repeated high-probability attempts')
  assert.ok(successfulSpy.intel?.troops && successfulSpy.intel?.resources, 'successful spying reveals only acquired intel')

  const { error: seedDefendingScoutsError } = await adminClient.from('village_troops').upsert({
    village_id: targetVillageId,
    unit_code: 'scout',
    quantity: 500,
  })
  assert.ifError(seedDefendingScoutsError)
  const { error: defenderPopulationError } = await adminClient.from('village_resources').update({
    population: 1000,
    population_capacity: 10000,
  }).eq('village_id', targetVillageId)
  assert.ifError(defenderPopulationError)

  let failedSpy
  for (let attempt = 0; attempt < 60 && !failedSpy; attempt += 1) {
    const report = await dispatchAndResolveSpy(targetVillageId, 'defended')
    if (report.result === 'failed') failedSpy = report
  }
  assert.ok(failedSpy, 'spying can fail against a large defending scout force')
  assert.equal('intel' in failedSpy, false, 'failed spying reveals no target intelligence')

  const concurrentRequestIds = [randomUUID(), randomUUID()]
  const concurrentDispatches = await Promise.all(concurrentRequestIds.map((requestId) =>
    attackerClient.rpc('send_troop_movement', {
      p_source_village_id: concurrentSourceId,
      p_target_village_id: targetVillageId,
      p_movement_type: 'attack',
      p_troops: { spearman: 5 },
      p_request_id: requestId,
    }),
  ))
  for (const dispatch of concurrentDispatches) assert.ifError(dispatch.error)
  const { data: simultaneousMovements, error: movementsError } = await adminClient.from('troop_movements')
    .select('id,request_id,status').in('request_id', concurrentRequestIds)
  assert.ifError(movementsError)
  assert.equal(simultaneousMovements.length, 2, 'two parallel movements from one village are recorded')
  assert.ok(simultaneousMovements.every((movement) => movement.status === 'travelling'))
  await Promise.all(simultaneousMovements.map((movement) => backdateMovement(movement.id)))

  await Promise.all([getOverview(attackerClient), getOverview(defenderClient)])
  await Promise.all([getOverview(attackerClient), getOverview(defenderClient)])
  const { data: completedMovements, error: completedMovementsError } = await adminClient.from('troop_movements')
    .select('id,status').in('id', simultaneousMovements.map((movement) => movement.id))
  assert.ifError(completedMovementsError)
  assert.ok(completedMovements.every((movement) => movement.status === 'resolved'), 'parallel arrivals are each resolved')
  const { data: simultaneousReports, error: simultaneousReportsError } = await adminClient.from('combat_reports')
    .select('movement_id,viewer_id').in('movement_id', simultaneousMovements.map((movement) => movement.id))
  assert.ifError(simultaneousReportsError)
  assert.equal(simultaneousReports.length, 4, 'each simultaneous battle creates one report per participant, only once')

  const exhaustedDispatch = await attackerClient.rpc('send_troop_movement', {
    p_source_village_id: concurrentSourceId,
    p_target_village_id: targetVillageId,
    p_movement_type: 'attack',
    p_troops: { spearman: 1 },
    p_request_id: randomUUID(),
  })
  assert.match(exhaustedDispatch.error?.message ?? '', /Nicht genügend Einheiten/)

  const { data: finalSourceUnits, error: finalSourceUnitsError } = await adminClient.from('village_troops')
    .select('quantity').eq('village_id', concurrentSourceId).eq('unit_code', 'spearman').single()
  assert.ifError(finalSourceUnitsError)
  assert.equal(finalSourceUnits.quantity, 0, 'simultaneous dispatches do not create or duplicate units')
} catch (error) {
  testFailure = error
}

for (const accountId of accountIds) {
  try {
    const { error } = await adminClient.auth.admin.deleteUser(accountId)
    if (error) throw error
  } catch (error) {
    testFailure ??= error
  }
}

if (testFailure) throw testFailure
console.log('Phase-D integration: ownership and input checks, concurrent dispatch, attack, combat, loot, sanitized reports, scout success/failure, one-time offline resolution and returns passed.')
