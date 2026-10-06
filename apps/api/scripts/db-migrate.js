// Applies the migrations in apps/api/drizzle to one schema, connected as `postgres`. The rules
// (single transaction, history with hashes, order checks) live in src/db/migrator.ts, which the
// tests run against PGlite.
//
// Usage:
//   pnpm --filter @pf/api db:migrate app_dev                     local development
//   pnpm --filter @pf/api db:migrate app --confirm-production    production (normally the CI deploy job)
//
// Connection, first match wins:
//   DATABASE_URL           full URL; the CI uses the Supabase session pooler (runners lack IPv6)
//   SUPABASE_DB_PASSWORD   direct connection; can come from apps/api/.env.credentials
//   otherwise the `postgres` password is asked without echo.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { migrate } from '../src/db/migrator.ts'
import { apiDir, askHidden, DB_HOST, DB_NAME, DB_PORT, withClient } from './lib/db.js'

const SCHEMAS = {
  app_dev: { production: false },
  app: { production: true },
}

function loadMigrations() {
  const dir = join(apiDir, 'drizzle')
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => ({
      name: file.replace(/\.sql$/, ''),
      sql: readFileSync(join(dir, file), 'utf8'),
    }))
}

async function connectionConfig() {
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

async function main() {
  const [schema, ...flags] = process.argv.slice(2)
  const target = SCHEMAS[schema]
  if (!target) throw new Error('Uso: db:migrate app_dev | db:migrate app --confirm-production')
  if (target.production && !flags.includes('--confirm-production')) {
    throw new Error('El schema app es producción: añade --confirm-production si de verdad es ahí.')
  }

  const migrations = loadMigrations()
  const applied = await withClient(await connectionConfig(), (client) =>
    migrate(client, schema, migrations),
  )
  console.log(
    applied.length > 0
      ? `✓ ${schema}: aplicadas ${applied.join(', ')}.`
      : `✓ ${schema}: nada pendiente (${migrations.length} migraciones ya aplicadas).`,
  )
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
