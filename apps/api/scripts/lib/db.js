// Shared by the database scripts: where the database is, how to reach it and how to ask for a
// password without echoing it.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

/** Direct connection (IPv6). GitHub runners have no IPv6 and use the session pooler instead. */
export const DB_HOST = 'db.qjzsepekcqqosgkbwuga.supabase.co'
export const DB_PORT = 5432
export const DB_NAME = 'postgres'

export const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const caCertPath = join(apiDir, 'certs', 'supabase-root-2021-ca.crt')

/**
 * Connects, runs `fn` and disconnects. `ca` plus Node's default hostname check is the equivalent of
 * sslmode=verify-full; the same root CA signs the direct host and the poolers.
 */
export async function withClient({ host, port, database, user, password }, fn) {
  const ssl = { ca: readFileSync(caCertPath, 'utf8') }
  const client = new pg.Client({ host, port, database, user, password, ssl })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/** Reads a line from the terminal without echoing it. */
export function askHidden(question) {
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

/** Schemas the admin scripts may target; `app` is production and needs an explicit flag. */
const SCHEMAS = { app_dev: { production: false }, app: { production: true } }

/** Validates the target schema of a script run, refusing production without --confirm-production. */
export function targetSchema(schema, flags, usage) {
  const target = SCHEMAS[schema]
  if (!target) throw new Error(`Uso: ${usage}`)
  if (target.production && !flags.includes('--confirm-production')) {
    throw new Error('El schema app es producción: añade --confirm-production si de verdad es ahí.')
  }
  return schema
}

/**
 * How to connect as `postgres`, first match wins:
 *   DATABASE_URL           full URL; the CI uses the Supabase session pooler (runners lack IPv6)
 *   SUPABASE_DB_PASSWORD   direct connection; can come from apps/api/.env.credentials
 *   otherwise the password is asked without echo.
 */
export async function adminConnection() {
  const url = process.env.DATABASE_URL
  if (url) {
    const { hostname, port, username, password, pathname } = new URL(url)
    return {
      host: hostname,
      port: Number(port || 5432),
      database: decodeURIComponent(pathname.slice(1)) || DB_NAME,
      user: decodeURIComponent(username),
      password: decodeURIComponent(password),
    }
  }
  const password =
    process.env.SUPABASE_DB_PASSWORD ||
    (await askHidden('Contraseña de la base (rol postgres, no se muestra): '))
  if (!password) throw new Error('No se escribió ninguna contraseña.')
  return { host: DB_HOST, port: DB_PORT, database: DB_NAME, user: 'postgres', password }
}
