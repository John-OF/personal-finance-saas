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
