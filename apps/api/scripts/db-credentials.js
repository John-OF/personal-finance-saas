// Assigns passwords to the API database roles (see bootstrap-db.sql) and wires them up:
//   - pf_api     (production, schema `app`)     → the Hyperdrive config used by the deployed Worker.
//   - pf_api_dev (local,      schema `app_dev`) → apps/api/.env, read by `wrangler dev`.
// Never prints a secret. Run it again to rotate both passwords.
//
// Usage: pnpm --filter @pf/api db:credentials
//
// Passwords come from apps/api/.env.credentials when it exists (ignored by git, deleted after a
// successful run):
//   SUPABASE_DB_PASSWORD=...   `postgres` password; asked without echo if missing
//   PF_API_PASSWORD=...        optional; generated at random if missing (recommended)
//   PF_API_DEV_PASSWORD=...    optional; generated at random if missing (recommended)

import { spawnSync } from 'node:child_process'
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const DB_HOST = 'db.qjzsepekcqqosgkbwuga.supabase.co'
const DB_PORT = 5432
const DB_NAME = 'postgres'
const PROD_ROLE = 'pf_api'
const DEV_ROLE = 'pf_api_dev'
const HYPERDRIVE_NAME = 'personal-finance-db'
// `wrangler cert upload certificate-authority --ca-cert certs/supabase-root-2021-ca.crt`
const HYPERDRIVE_CA_CERT_ID = '0448dc23-0ace-46f6-aafe-58363cc3dc92'
const LOCAL_CONNECTION_ENV = 'CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE'

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const caCertPath = join(apiDir, 'certs', 'supabase-root-2021-ca.crt')
const envPath = join(apiDir, '.env')
const credentialsPath = join(apiDir, '.env.credentials')
const CREDENTIAL_ENV_NAMES = ['SUPABASE_DB_PASSWORD', 'PF_API_PASSWORD', 'PF_API_DEV_PASSWORD']

/** Every secret handled by this run, so that no message can leak one. */
const secrets = new Set()

function redact(text) {
  let result = text
  for (const secret of secrets) result = result.replaceAll(secret, '***')
  return result
}
const wranglerConfigPath = join(apiDir, 'wrangler.jsonc')

/** Reads a line from the terminal without echoing it. */
function askHidden(question) {
  const { stdin, stdout } = process
  if (!stdin.isTTY) throw new Error('Ejecuta este script en una terminal interactiva.')
  return new Promise((resolve, reject) => {
    let value = ''
    const finish = (error) => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
      stdout.write('\n')
      if (error) reject(error)
      else resolve(value)
    }
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish()
        if (char === '\u0003') return finish(new Error('Cancelado.'))
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1)
        else value += char
      }
    }
    stdout.write(question)
    stdin.setEncoding('utf8')
    stdin.setRawMode(true)
    stdin.resume()
    stdin.on('data', onData)
  })
}

/** The password from `envName`, or 32 random URL-safe characters. */
function rolePassword(envName) {
  const given = process.env[envName]
  if (!given) return randomBytes(24).toString('base64url')
  // Printable ASCII only: avoids SASLprep normalization differences between clients.
  if (!/^[\x21-\x7e]{16,}$/.test(given)) {
    throw new Error(
      `${envName} debe tener al menos 16 caracteres ASCII visibles (sin espacios, acentos ni ñ).`,
    )
  }
  return given
}

/**
 * SCRAM-SHA-256 verifier in the format Postgres stores. Sending it pre-hashed keeps the plain
 * password out of the server (and its logs).
 */
function scramVerifier(password) {
  const iterations = 4096
  const salt = randomBytes(16)
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256')
  const hmac = (key, message) => createHmac('sha256', key).update(message).digest()
  const storedKey = createHash('sha256').update(hmac(salted, 'Client Key')).digest()
  const serverKey = hmac(salted, 'Server Key')
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`
}

async function withClient(user, password, fn) {
  // `ca` plus Node's default hostname check is the equivalent of sslmode=verify-full.
  const ssl = { ca: readFileSync(caCertPath, 'utf8') }
  const client = new pg.Client({
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user,
    password,
    ssl,
  })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

function runWrangler(args) {
  const require = createRequire(import.meta.url)
  const wranglerBin = join(dirname(require.resolve('wrangler/package.json')), 'bin', 'wrangler.js')
  const env = { ...process.env }
  for (const name of CREDENTIAL_ENV_NAMES) delete env[name]
  const result = spawnSync(process.execPath, [wranglerBin, ...args], {
    cwd: apiDir,
    encoding: 'utf8',
    env,
  })
  const output = redact(`${result.stdout}\n${result.stderr}`)
  if (result.status !== 0) throw new Error(`wrangler ${args[0]} ${args[1]} falló:\n${output}`)
  return output
}

function existingHyperdriveId() {
  const config = readFileSync(wranglerConfigPath, 'utf8')
  return /"hyperdrive"\s*:\s*\[[^\]]*?"id"\s*:\s*"([0-9a-f-]{32,36})"/.exec(config)?.[1]
}

function upsertEnvVar(path, key, value) {
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/) : []
  const kept = lines.filter((line) => line.trim() !== '' && !line.startsWith(`${key}=`))
  writeFileSync(path, [...kept, `${key}=${value}`, ''].join('\n'), { mode: 0o600 })
}

async function main() {
  const adminPassword =
    process.env.SUPABASE_DB_PASSWORD ||
    (await askHidden(`Contraseña de la base (rol postgres, no se muestra): `))
  if (!adminPassword) throw new Error('No se escribió ninguna contraseña.')

  const passwords = {
    [PROD_ROLE]: rolePassword('PF_API_PASSWORD'),
    [DEV_ROLE]: rolePassword('PF_API_DEV_PASSWORD'),
  }
  for (const secret of [adminPassword, ...Object.values(passwords)]) secrets.add(secret)

  await withClient('postgres', adminPassword, async (client) => {
    for (const [role, password] of Object.entries(passwords)) {
      // ALTER ROLE does not accept bind parameters; the verifier is base64 plus `$:` only.
      await client.query(`alter role ${role} password '${scramVerifier(password)}'`)
    }
  })
  console.log('✓ Contraseñas asignadas a pf_api y pf_api_dev.')

  for (const [role, password] of Object.entries(passwords)) {
    const { rows } = await withClient(role, password, (client) =>
      client.query('select current_user as "user", current_schema() as schema'),
    )
    console.log(`✓ ${rows[0].user} entra con TLS verificado y usa el schema ${rows[0].schema}.`)
  }

  const sslRootCert = encodeURIComponent(caCertPath)
  upsertEnvVar(
    envPath,
    LOCAL_CONNECTION_ENV,
    `postgresql://${DEV_ROLE}:${encodeURIComponent(passwords[DEV_ROLE])}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=verify-full&sslrootcert=${sslRootCert}`,
  )
  console.log('✓ apps/api/.env actualizado (desarrollo local → pf_api_dev).')

  const prodPassword = passwords[PROD_ROLE]
  const hyperdriveId = existingHyperdriveId()
  if (hyperdriveId) {
    runWrangler(['hyperdrive', 'update', hyperdriveId, '--origin-password', prodPassword])
    console.log(`✓ Hyperdrive ${hyperdriveId} actualizado con la contraseña nueva de pf_api.`)
  } else {
    const output = runWrangler([
      'hyperdrive',
      'create',
      HYPERDRIVE_NAME,
      '--origin-host',
      DB_HOST,
      '--origin-port',
      String(DB_PORT),
      '--database',
      DB_NAME,
      '--origin-user',
      PROD_ROLE,
      '--origin-password',
      prodPassword,
      '--sslmode',
      'verify-full',
      '--ca-certificate-id',
      HYPERDRIVE_CA_CERT_ID,
      // Cached reads would hide a just-saved transaction for up to a minute.
      '--caching-disabled',
    ])
    const id = /config: ([0-9a-f-]{32,36})/.exec(output)?.[1]
    console.log(
      `✓ Hyperdrive "${HYPERDRIVE_NAME}" creado. ID: ${id ?? '(no encontrado en la salida)'}`,
    )
  }

  if (existsSync(credentialsPath)) {
    rmSync(credentialsPath)
    console.log('✓ apps/api/.env.credentials borrado.')
  }
}

main().catch((error) => {
  console.error(`✗ ${redact(error instanceof Error ? error.message : String(error))}`)
  process.exitCode = 1
})
