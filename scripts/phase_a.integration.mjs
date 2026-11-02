import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { readLocalSupabaseConfig } from './local-supabase.mjs'

const { apiUrl, anonKey, serviceRoleKey } = readLocalSupabaseConfig()
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } }
const userClient = createClient(apiUrl, anonKey, clientOptions)
const adminClient = createClient(apiUrl, serviceRoleKey, clientOptions)
const email = `phase-a-${randomUUID()}@example.test`
const password = `Phase-A-${randomUUID()}!`
let userId
let villageId

let testFailure
try {
  const { data: signup, error: signupError } = await userClient.auth.signUp({
    email,
    password,
    options: { data: { display_name: 'Test-Erbe' } },
  })
  assert.ifError(signupError)
  assert.ok(signup.session, 'local signup should return an authenticated session')
  userId = signup.user?.id
  assert.ok(userId, 'signup should return a user id')

  const { data: beforeFounding, error: initialError } = await userClient.rpc('get_my_starting_village')
  assert.ifError(initialError)
  assert.equal(beforeFounding, null, 'new profile should not have a village before founding')

  const { data: village, error: foundingError } = await userClient.rpc('found_starting_village', { p_name: 'Morgenhain' })
  assert.ifError(foundingError)
  assert.equal(village.name, 'Morgenhain')
  villageId = village.id
  assert.equal(village.points, 100)
  assert.equal(village.resources.wood, 250)
  assert.equal(village.resources.clay, 220)
  assert.equal(village.resources.iron, 180)
  assert.equal(village.resources.food, 300)
  assert.equal(village.resources.storage_capacity, 1000)
  assert.equal(Object.keys(village.buildings).length, 12)

  const { data: repeatedVillage, error: repeatedError } = await userClient.rpc('found_starting_village', { p_name: 'Anderer Name' })
  assert.ifError(repeatedError)
  assert.equal(repeatedVillage.id, village.id, 'founding must be idempotent per player')
  assert.equal(repeatedVillage.name, village.name, 'repeated founding must not rename the village')

  const { data: map, error: mapError } = await userClient.rpc('get_world_map', {
    p_center_x: village.x,
    p_center_y: village.y,
    p_radius: 4,
  })
  assert.ifError(mapError)
  assert.equal(map.length, 81, 'radius four should return exactly an 9 by 9 bounded region')
  const ownMarker = map.find((tile) => tile.village_id === village.id)
  assert.equal(ownMarker.owner_name, 'Test-Erbe', 'map should return the persisted owner profile')

  const { error: directReadError } = await userClient.from('villages').select('id').limit(1)
  assert.ok(directReadError, 'authenticated clients must not read critical tables directly')

  const anonymousClient = createClient(apiUrl, anonKey, clientOptions)
  const { error: anonymousRpcError } = await anonymousClient.rpc('get_world_map', {
    p_center_x: 0,
    p_center_y: 0,
    p_radius: 4,
  })
  assert.ok(anonymousRpcError, 'anonymous clients must not call protected world RPCs')

  const { error: signOutError } = await userClient.auth.signOut()
  assert.ifError(signOutError)
  const { data: signedIn, error: signInError } = await userClient.auth.signInWithPassword({ email, password })
  assert.ifError(signInError)
  assert.ok(signedIn.session, 'registered credentials should sign in')
  const { data: restoredVillage, error: restoreError } = await userClient.rpc('get_my_starting_village')
  assert.ifError(restoreError)
  assert.equal(restoredVillage.id, village.id, 'the village should persist across sessions')

} catch (error) {
  testFailure = error
}

if (userId) {
  try {
    const { error } = await adminClient.auth.admin.deleteUser(userId)
    if (error) throw error
    if (villageId) {
      const { data: remainingVillages, error: lookupError } = await adminClient
        .from('villages')
        .select('id')
        .eq('id', villageId)
      if (lookupError) throw lookupError
      assert.equal(remainingVillages.length, 0, 'deleting a profile should cascade to its village')
    }
  } catch (error) {
    testFailure ??= error
  }
}

if (testFailure) throw testFailure
console.log('Phase-A Integration: signup, profile trigger, founding, idempotency, map, RLS, sign-in and persistence passed.')
