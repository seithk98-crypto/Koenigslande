import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function readLocalSupabaseConfig() {
  const cliProfile = join(homedir(), '.supabase', 'profile')
  if (existsSync(cliProfile)) {
    try {
      const output = execFileSync('npx', ['supabase', 'status', '--output', 'env'], { encoding: 'utf8' })
      const values = Object.fromEntries(output.split('\n').flatMap((line) => {
        const match = line.match(/^([A-Z_]+)="?([^"\n]+)"?$/)
        return match ? [[match[1], match[2]]] : []
      }))
      const config = { apiUrl: values.API_URL, anonKey: values.ANON_KEY, serviceRoleKey: values.SERVICE_ROLE_KEY }
      assert.ok(config.apiUrl && config.anonKey && config.serviceRoleKey, 'Local Supabase must be running')
      return config
    } catch (statusError) {
      try {
        return readDockerSupabaseConfig()
      } catch (fallbackError) {
        throw new AggregateError([statusError, fallbackError], 'Could not load local Supabase credentials')
      }
    }
  }
  return readDockerSupabaseConfig()
}

function readDockerSupabaseConfig() {
  const supabaseConfig = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8')
  const projectId = supabaseConfig.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1]
  const apiPort = supabaseConfig.match(/^\[api\][\s\S]*?^port\s*=\s*(\d+)/m)?.[1]
  assert.ok(projectId && apiPort, 'Local Supabase configuration must define its project and API port')
  const jwtSecret = execFileSync('docker', [
    'exec', `supabase_auth_${projectId}`, 'printenv', 'GOTRUE_JWT_SECRET',
  ], { encoding: 'utf8' }).trim()
  assert.ok(jwtSecret, 'The local Supabase auth service must expose its JWT secret')
  const createLocalKey = (role) => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const now = Math.floor(Date.now() / 1000)
    const payload = Buffer.from(JSON.stringify({
      iss: 'supabase', role, aud: 'authenticated', iat: now, exp: now + 3600,
    })).toString('base64url')
    const signingInput = `${header}.${payload}`
    const signature = createHmac('sha256', jwtSecret).update(signingInput).digest('base64url')
    return `${signingInput}.${signature}`
  }
  return {
    apiUrl: `http://127.0.0.1:${apiPort}`,
    anonKey: createLocalKey('anon'),
    serviceRoleKey: createLocalKey('service_role'),
  }
}
