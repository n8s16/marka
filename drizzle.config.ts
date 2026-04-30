import type { Config } from 'drizzle-kit';

// Drizzle config for Marka.
//
// We use the expo-sqlite driver so generated migrations are written in a
// dialect compatible with the runtime database. The schema file is owned by
// the data-modeler subagent; right now it is an empty stub.
//
// `npm run migrate` runs `drizzle-kit generate`, which reads `./db/schema.ts`
// and writes SQL migration files to `./db/migrations`.

export default {
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'sqlite',
  driver: 'expo',
} satisfies Config;
