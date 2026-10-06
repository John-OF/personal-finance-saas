import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'

export type Db = NodePgDatabase

/**
 * Opens one connection for the current request. Creating it is cheap: Hyperdrive keeps the real
 * pool next to the database. The schema (`app` or `app_dev`) comes from the role's search_path,
 * so it is decided by the connection string alone.
 */
export async function openDb(connectionString: string) {
  const client = new Client({ connectionString })
  await client.connect()
  return {
    client,
    db: drizzle({ client }),
    // A failure while closing cannot affect a response that has already been sent.
    close: () => client.end().catch(() => undefined),
  }
}

export type DbConnection = Awaited<ReturnType<typeof openDb>>
