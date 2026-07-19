// Human-owned DB client. The Codex agent must not edit this file (see AGENTS.md).
// All DB access goes through Server Actions / Route Handlers that import `db` from here;
// never import this from a "use client" file.
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';

const databasePath = process.env.DATABASE_PATH ?? './data/app.db';
mkdirSync(dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);
try {
  sqlite.pragma('journal_mode = WAL');
} catch (err) {
  // Bind-mounted filesystems (Docker on macOS) can transiently reject the WAL
  // switch with SQLITE_IOERR; the default rollback journal is fine for this app.
  // Never crash the app over journal mode, but leave a trail for debugging.
  console.warn('[db] journal_mode=WAL failed, using default rollback journal:', err);
}

export const db = drizzle(sqlite, { schema });
