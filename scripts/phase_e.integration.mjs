import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { readLocalSupabaseConfig } from './local-supabase.mjs'

const config = readLocalSupabaseConfig()
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } }
const adminClient = createClient(config.apiUrl, config.serviceRoleKey, clientOptions)
const players = [
  { client: createClient(config.apiUrl, config.anonKey, clientOptions), name: `Eichen-${randomUUID().slice(0, 6)}` },
  { client: createClient(config.apiUrl, config.anonKey, clientOptions), name: `Raben-${randomUUID().slice(0, 6)}` },
  { client: createClient(config.apiUrl, config.anonKey, clientOptions), name: `Falken-${randomUUID().slice(0, 6)}` },
]
const userIds = []
let testFailure
let capturedBarbarianId
let captureOwnerId

try {
  for (const player of players) {
    const { data, error } = await player.client.auth.signUp({
      email: `phase-e-${randomUUID()}@example.test`,
      password: `Phase-E-${randomUUID()}!`,
      options: { data: { display_name: player.name } },
    })
    assert.ifError(error)
    assert.ok(data.session && data.user?.id, 'local signup returns an authenticated player')
    player.id = data.user.id
    userIds.push(data.user.id)
    const { data: village, error: foundingError } = await player.client.rpc('found_starting_village', {
      p_name: `${player.name}heim`,
    })
    assert.ifError(foundingError)
    player.villageId = village.id
  }

  const [founder, member, diplomat] = players
  captureOwnerId = founder.id
  const { data: initialVillages, error: villageListError } = await founder.client.rpc('get_owned_villages')
  assert.ifError(villageListError)
  assert.equal(initialVillages.length, 1, 'initial accounts keep their existing first village')

  const { error: expansionResourcesError } = await adminClient.from('village_resources').update({
    wood: 4000,
    clay: 4000,
    iron: 4000,
    population: 100,
  }).eq('village_id', founder.villageId)
  assert.ifError(expansionResourcesError)
  const { error: expansionWarehouseError } = await adminClient.from('village_buildings').update({ level: 6 })
    .eq('village_id', founder.villageId).eq('building_code', 'warehouse')
  assert.ifError(expansionWarehouseError)
  const { data: secondVillage, error: expansionError } = await founder.client.rpc('found_additional_village', {
    p_source_village_id: founder.villageId,
    p_name: 'Grenzwarte',
  })
  assert.ifError(expansionError)
  assert.notEqual(secondVillage.id, founder.villageId)
  const { data: twoVillages, error: secondListError } = await founder.client.rpc('get_owned_villages')
  assert.ifError(secondListError)
  assert.equal(twoVillages.length, 2, 'second village is created and appears in the owned-village selector')
  assert.ok(twoVillages.find((village) => village.id === founder.villageId).resources.wood >= 2500)
  const { data: foreignVillage, error: foreignVillageError } = await member.client.rpc('get_village_state', {
    p_village_id: founder.villageId,
  })
  assert.equal(foreignVillage, null, 'another player cannot switch to or load a foreign village')
  assert.match(foreignVillageError?.message ?? '', /Eigenes Dorf nicht gefunden/)

  const { data: profile, error: profileError } = await founder.client.rpc('update_player_profile', {
    p_username: founder.name,
    p_avatar_url: 'https://example.test/avatar.png',
    p_description: 'Wächter der Grenzlande',
  })
  assert.ifError(profileError)
  assert.equal(profile.avatar_url, 'https://example.test/avatar.png')
  assert.equal(profile.description, 'Wächter der Grenzlande')
  const duplicateName = await member.client.rpc('update_player_profile', {
    p_username: founder.name,
    p_avatar_url: null,
    p_description: '',
  })
  assert.match(duplicateName.error?.message ?? '', /bereits vergeben/)

  const { data: alliance, error: allianceError } = await founder.client.rpc('create_alliance', {
    p_name: `Wachtbund ${randomUUID().slice(0, 6)}`,
    p_tag: `W${randomUUID().slice(0, 4)}`,
    p_description: 'Gemeinsam halten wir die Grenze.',
  })
  assert.ifError(allianceError)
  const { data: invitationId, error: inviteError } = await founder.client.rpc('invite_alliance_member', {
    p_username: member.name,
  })
  assert.ifError(inviteError)
  const memberSocial = await member.client.rpc('get_multiplayer_overview')
  assert.ifError(memberSocial.error)
  assert.equal(memberSocial.data.invitations.length, 1)
  assert.equal(memberSocial.data.invitations[0].id, invitationId)
  const { error: acceptError } = await member.client.rpc('respond_alliance_invitation', {
    p_invitation_id: invitationId,
    p_accept: true,
  })
  assert.ifError(acceptError)
  const unauthorizedInvite = await member.client.rpc('invite_alliance_member', { p_username: diplomat.name })
  assert.match(unauthorizedInvite.error?.message ?? '', /Nur Gründer und Anführer/)
  const { error: promoteError } = await founder.client.rpc('manage_alliance_member', {
    p_player_id: member.id,
    p_action: 'role',
    p_role: 'diplomat',
  })
  assert.ifError(promoteError)
  const allowedInvite = await member.client.rpc('invite_alliance_member', { p_username: diplomat.name })
  assert.match(allowedInvite.error?.message ?? '', /Nur Gründer und Anführer/)
  const { error: roleRollbackError } = await founder.client.rpc('manage_alliance_member', {
    p_player_id: member.id,
    p_action: 'role',
    p_role: 'member',
  })
  assert.ifError(roleRollbackError)

  const { data: declinedInvite, error: declinedInviteError } = await founder.client.rpc('invite_alliance_member', {
    p_username: diplomat.name,
  })
  assert.ifError(declinedInviteError)
  const { error: declineError } = await diplomat.client.rpc('respond_alliance_invitation', {
    p_invitation_id: declinedInvite,
    p_accept: false,
  })
  assert.ifError(declineError)
  const { data: otherAlliance, error: otherAllianceError } = await diplomat.client.rpc('create_alliance', {
    p_name: `Falkenbund ${randomUUID().slice(0, 6)}`,
    p_tag: `F${randomUUID().slice(0, 4)}`,
    p_description: 'Ein zweiter Bund für Diplomatie.',
  })
  assert.ifError(otherAllianceError)

  const { data: diplomacyId, error: diplomacyError } = await founder.client.rpc('propose_diplomacy', {
    p_target_alliance: otherAlliance.id,
    p_relation_type: 'non_aggression',
  })
  assert.ifError(diplomacyError)
  const unauthorizedResponse = await member.client.rpc('respond_diplomacy', {
    p_relation_id: diplomacyId,
    p_accept: true,
  })
  assert.match(unauthorizedResponse.error?.message ?? '', /Diplomatie ist nur/)
  const outsiderDiplomacy = await member.client.rpc('propose_diplomacy', {
    p_target_alliance: otherAlliance.id,
    p_relation_type: 'war',
  })
  assert.match(outsiderDiplomacy.error?.message ?? '', /Diplomatie ist nur/)
  const { error: acceptDiplomacyError } = await diplomat.client.rpc('respond_diplomacy', {
    p_relation_id: diplomacyId,
    p_accept: true,
  })
  assert.ifError(acceptDiplomacyError)
  const diplomatOverview = await diplomat.client.rpc('get_multiplayer_overview')
  assert.ifError(diplomatOverview.error)
  assert.equal(diplomatOverview.data.diplomacy[0].relation_type, 'non_aggression')
  const { error: endDiplomacyError } = await diplomat.client.rpc('end_diplomacy', { p_relation_id: diplomacyId })
  assert.ifError(endDiplomacyError)

  const { error: allianceMessageError } = await founder.client.rpc('send_alliance_message', {
    p_body: 'Die Wachen stehen bereit.',
  })
  assert.ifError(allianceMessageError)
  const memberOverview = await member.client.rpc('get_multiplayer_overview')
  assert.ifError(memberOverview.error)
  assert.equal(memberOverview.data.alliance.id, alliance.id)
  assert.equal(memberOverview.data.alliance.members.length, 2)
  assert.equal(memberOverview.data.alliance.messages[0].body, 'Die Wachen stehen bereit.')

  const { data: privateMessageId, error: privateMessageError } = await founder.client.rpc('send_private_message', {
    p_recipient_username: diplomat.name,
    p_body: 'Dies ist eine private Botschaft.',
  })
  assert.ifError(privateMessageError)
  const diplomatOverviewAfterMessage = await diplomat.client.rpc('get_multiplayer_overview')
  assert.ifError(diplomatOverviewAfterMessage.error)
  const receivedMessage = diplomatOverviewAfterMessage.data.messages.find((message) => message.id === privateMessageId)
  assert.equal(receivedMessage.body, 'Dies ist eine private Botschaft.')
  const outsiderOverview = await member.client.rpc('get_multiplayer_overview')
  assert.ifError(outsiderOverview.error)
  assert.equal(outsiderOverview.data.messages.some((message) => message.id === privateMessageId), false)
  const unauthorizedDelete = await member.client.rpc('manage_private_message', {
    p_message_id: privateMessageId,
    p_action: 'delete',
  })
  assert.match(unauthorizedDelete.error?.message ?? '', /nicht zugänglich/)
  const { error: archiveError } = await diplomat.client.rpc('manage_private_message', {
    p_message_id: privateMessageId,
    p_action: 'archive',
  })
  assert.ifError(archiveError)
  const archivedOverview = await diplomat.client.rpc('get_multiplayer_overview')
  assert.ifError(archivedOverview.error)
  assert.equal(archivedOverview.data.messages.some((message) => message.id === privateMessageId), false)

  const { data: rankings, error: rankingsError } = await founder.client.rpc('get_player_rankings')
  assert.ifError(rankingsError)
  assert.ok(rankings.players.some((player) => player.id === founder.id && player.points >= 200))
  assert.ok(rankings.alliances.some((rankedAlliance) => rankedAlliance.id === alliance.id && rankedAlliance.member_count === 2))
  assert.ok(rankings.villages.some((rankedVillage) => rankedVillage.id === founder.villageId))

  const { data: map, error: mapError } = await founder.client.rpc('get_world_map', {
    p_center_x: twoVillages.find((village) => village.id === founder.villageId).x,
    p_center_y: twoVillages.find((village) => village.id === founder.villageId).y,
    p_radius: 4,
  })
  assert.ifError(mapError)
  const ownMapTile = map.find((tile) => tile.village_id === founder.villageId)
  assert.equal(ownMapTile.alliance_tag, alliance.tag, 'world-map village tiles include alliance affiliation')

  const { error: seedNoblesError } = await adminClient.from('village_troops').upsert({
    village_id: founder.villageId,
    unit_code: 'noble',
    quantity: 20,
  })
  assert.ifError(seedNoblesError)
  const { error: seedPopulationError } = await adminClient.from('village_resources').update({
    population: 5000,
    population_capacity: 10000,
  }).eq('village_id', founder.villageId)
  assert.ifError(seedPopulationError)
  const { data: target, error: targetError } = await adminClient.from('villages')
    .select('id,owner_id').eq('id', diplomat.villageId).single()
  assert.ifError(targetError)
  const { data: attack, error: attackError } = await founder.client.rpc('send_troop_movement', {
    p_source_village_id: founder.villageId,
    p_target_village_id: target.id,
    p_movement_type: 'attack',
    p_troops: { noble: 20 },
    p_request_id: randomUUID(),
  })
  assert.ifError(attackError)
  const movement = attack.movements.find((entry) => entry.source_village_id === founder.villageId)
  assert.ok(movement)
  const sentAt = Date.now() - 10_000
  const { error: accelerateError } = await adminClient.from('troop_movements').update({
    sent_at: new Date(sentAt).toISOString(),
    arrives_at: new Date(sentAt + 5000).toISOString(),
  }).eq('id', movement.id)
  assert.ifError(accelerateError)
  const { error: settleError } = await founder.client.rpc('get_movement_overview')
  assert.ifError(settleError)
  const { data: capturedVillage, error: capturedError } = await adminClient.from('villages')
    .select('owner_id').eq('id', target.id).single()
  assert.ifError(capturedError)
  assert.equal(capturedVillage.owner_id, founder.id, 'village ownership changes only after a winning battle with a surviving noble')
  const { data: captureReport, error: captureReportError } = await adminClient.from('combat_reports')
    .select('report_data').eq('movement_id', movement.id).eq('viewer_id', founder.id).single()
  assert.ifError(captureReportError)
  assert.equal(captureReport.report_data.captured, true)

  const { error: seedSecondNoblesError } = await adminClient.from('village_troops').upsert({
    village_id: secondVillage.id,
    unit_code: 'noble',
    quantity: 20,
  })
  assert.ifError(seedSecondNoblesError)
  const { error: secondPopulationError } = await adminClient.from('village_resources').update({
    population: 5000,
    population_capacity: 10000,
  }).eq('village_id', secondVillage.id)
  assert.ifError(secondPopulationError)
  const { data: barbarian, error: barbarianError } = await adminClient.from('villages')
    .select('id').eq('is_barbarian', true).limit(1).single()
  assert.ifError(barbarianError)
  capturedBarbarianId = barbarian.id
  const { data: barbarianAttack, error: barbarianAttackError } = await founder.client.rpc('send_troop_movement', {
    p_source_village_id: secondVillage.id,
    p_target_village_id: barbarian.id,
    p_movement_type: 'attack',
    p_troops: { noble: 20 },
    p_request_id: randomUUID(),
  })
  assert.ifError(barbarianAttackError)
  const barbarianMovement = barbarianAttack.movements.find((entry) => entry.source_village_id === secondVillage.id)
  assert.ok(barbarianMovement)
  const barbarianSentAt = Date.now() - 10_000
  const { error: accelerateBarbarianError } = await adminClient.from('troop_movements').update({
    sent_at: new Date(barbarianSentAt).toISOString(),
    arrives_at: new Date(barbarianSentAt + 5000).toISOString(),
  }).eq('id', barbarianMovement.id)
  assert.ifError(accelerateBarbarianError)
  await founder.client.rpc('get_movement_overview')
  const { data: capturedBarbarian, error: capturedBarbarianError } = await adminClient.from('villages')
    .select('owner_id,is_barbarian').eq('id', barbarian.id).single()
  assert.ifError(capturedBarbarianError)
  assert.equal(capturedBarbarian.owner_id, founder.id)
  assert.equal(capturedBarbarian.is_barbarian, false, 'a conquered neutral village becomes a player-owned village')

  const { error: leaveAllianceError } = await member.client.rpc('leave_alliance')
  assert.ifError(leaveAllianceError)
  const memberAfterLeaving = await member.client.rpc('get_multiplayer_overview')
  assert.ifError(memberAfterLeaving.error)
  assert.equal(memberAfterLeaving.data.alliance, null, 'members can leave an alliance')
  const { data: rejoinInvitation, error: rejoinInviteError } = await founder.client.rpc('invite_alliance_member', {
    p_username: member.name,
  })
  assert.ifError(rejoinInviteError)
  const { error: rejoinError } = await member.client.rpc('respond_alliance_invitation', {
    p_invitation_id: rejoinInvitation,
    p_accept: true,
  })
  assert.ifError(rejoinError)
  const { error: removeMemberError } = await founder.client.rpc('manage_alliance_member', {
    p_player_id: member.id,
    p_action: 'remove',
  })
  assert.ifError(removeMemberError)
  const memberAfterRemoval = await member.client.rpc('get_multiplayer_overview')
  assert.ifError(memberAfterRemoval.error)
  assert.equal(memberAfterRemoval.data.alliance, null, 'founders can remove alliance members')
  const { error: dissolveAllianceError } = await founder.client.rpc('dissolve_alliance')
  assert.ifError(dissolveAllianceError)
  const founderAfterDissolution = await founder.client.rpc('get_multiplayer_overview')
  assert.ifError(founderAfterDissolution.error)
  assert.equal(founderAfterDissolution.data.alliance, null, 'founders can dissolve their alliance')

  const { data: ownNotifications, error: ownNotificationError } = await founder.client
    .from('multiplayer_notifications').select('event_type').limit(100)
  assert.ifError(ownNotificationError)
  assert.ok(ownNotifications.length > 0, 'safe notifications are visible to their recipient')
  const { data: foreignNotifications, error: foreignNotificationError } = await member.client
    .from('multiplayer_notifications').select('event_type').eq('recipient_id', founder.id)
  assert.ifError(foreignNotificationError)
  assert.equal(foreignNotifications.length, 0, 'notification RLS hides another player’s events')

  const { error: directMessagesError } = await member.client.from('private_messages').select('body')
  assert.match(directMessagesError?.message ?? '', /permission denied/, 'private-message table is not directly readable')
} catch (error) {
  testFailure = error
}

if (capturedBarbarianId && captureOwnerId) {
  try {
    const { error } = await adminClient.from('villages')
      .update({ owner_id: null, is_barbarian: true })
      .eq('id', capturedBarbarianId)
      .eq('owner_id', captureOwnerId)
    if (error) throw error
  } catch (error) {
    testFailure ??= error
  }
}

for (const userId of userIds) {
  try {
    const { error } = await adminClient.auth.admin.deleteUser(userId)
    if (error) throw error
  } catch (error) {
    testFailure ??= error
  }
}

if (testFailure) throw testFailure
console.log('Phase-E integration: profiles, unique names, multi-village ownership, alliance lifecycle and roles, invitations, diplomacy, private/alliance messages, rankings, map affiliations, combat-based capture and RLS passed.')
