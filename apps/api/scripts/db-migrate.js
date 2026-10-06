// Applies the migrations in apps/api/drizzle to one schema, connected as `postgres`. The rules
// (single transaction, history with hashes, order checks) live in src/db/migrator.ts, which the
// tests run against PGlite.
//
// Usage:
//   pnpm --filter @pf/api db:migrate app_dev                     local development
//   pnpm --filter @pf/api db:migrate app --confirm-production    production (normally the CI deploy job)
//
// Connection: see adminConnection in scripts/lib/db.js.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { migrate } from '../src/db/migrator.ts'
import { adminConnection, apiDir, targetSchema, withClient } from './lib/db.js'

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

async function main() {
  const [schemaArg, ...flags] = process.argv.slice(2)
  const schema = targetSchema(
    schemaArg,
    flags,
    'db:migrate app_dev | db:migrate app --confirm-production',
  )

  const migrations = loadMigrations()
  const applied = await withClient(await adminConnection(), (client) =>
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
