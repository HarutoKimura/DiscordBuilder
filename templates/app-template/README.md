# app-template

The single template every generated app starts from: Next.js (App Router) + SQLite
(Drizzle ORM) + Tailwind. A copy of this directory is placed inside each project's
sandbox container, where the Codex agent edits it according to `AGENTS.md`.

Human-owned (Codex must not touch): `middleware.ts`, `db/client.ts`, `next.config.ts`,
`drizzle.config.ts`, `package.json`, config files. Codex-owned: `app/`, `db/schema.ts`,
`db/seed.ts`.

Standalone on purpose — NOT part of the pnpm workspace (it is copied and installed
independently inside sandboxes).
