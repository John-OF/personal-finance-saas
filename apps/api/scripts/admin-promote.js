// Makes a registered user an admin, connected as `postgres` (the API cannot write roles). There is
// no way to do it from the web app.
//
// Usage:
//   pnpm --filter @pf/api admin:promote app_dev <email>
//   pnpm --filter @pf/api admin:promote app <email> --confirm-production
//
// Connection: see adminConnection in scripts/lib/db.js.

import { promoteToAdmin } from '../src/db/admin.ts'
import { adminConnection, targetSchema, withClient } from './lib/db.js'

const USAGE = 'admin:promote app_dev <correo> | admin:promote app <correo> --confirm-production'

async function main() {
  const [schemaArg, email, ...flags] = process.argv.slice(2)
  const schema = targetSchema(schemaArg, flags, USAGE)
  if (!email || email.startsWith('--')) throw new Error(`Uso: ${USAGE}`)

  const userId = await withClient(await adminConnection(), (client) =>
    promoteToAdmin(client, schema, email),
  )
  console.log(`✓ ${email} (${userId}) es administrador en ${schema}.`)
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
