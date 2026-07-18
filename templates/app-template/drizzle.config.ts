// Human-owned. The Codex agent must not edit this file (see AGENTS.md).
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './db/schema.ts',
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? './data/app.db',
  },
});
