import { defineConfig } from 'drizzle-kit'

// Only generates SQL (`pnpm --filter @pf/api db:generate`); review it before committing.
// scripts/db-migrate.js applies it to the schema given on the command line.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
})
