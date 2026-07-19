# CLAUDE.md — DiscordBuilder

## What this is

**DiscordBuilder** — "multiplayer vibe coding". A Discord server becomes a development studio:

- A community member runs `/build <what they want>` in Discord. The bot runs **OpenAI Codex** (`codex exec`, model **GPT-5.6 Sol**) inside a per-project sandbox to generate a full-stack app, then posts a preview URL to a thread.
- Anyone replying in that thread ("fix this part") creates an edit task → diff summary → redeploy.
- Reaction voting (👍 ×2) gates production ship approval.
- The conversation log doubles as the spec and the development history.

**Context:** OpenAI Build Week hackathon entry. Deadline **2026-07-21 5PM PT** (2026-07-22 09:00 JST). Single developer working part-time. Judging criteria: substance of Codex integration / usability for non-developers / solving a real problem / quality of the idea.

**Prime directive: every implementation decision optimizes for ONE golden path that reliably works in a 3-minute demo video.** When in doubt, choose the option that makes the demo more reliable, not the option that is more general or more elegant.

## ⚠️ The runtime agent is Codex — never substitute it

Claude develops **this repository**. The agent that generates apps **at runtime** is always OpenAI Codex (`codex exec`, non-interactive, model GPT-5.6 Sol). This is the heart of the judging criteria. Do not replace the generation engine with Claude or any other model, even temporarily, even for testing shortcuts. Mock the sandbox boundary in tests instead.

## Architecture (decided — do not revisit)

```
Discord (discord.js v14, slash commands + threads)
   │
   ▼
Orchestrator (Node.js + TypeScript, single process)
   │  - project registry (channel/thread ↔ project mapping)
   │  - build queue (serial per project, parallel across projects)
   │  - summarizes the Codex event stream → progress posts in the Discord thread
   ▼
Sandbox (one Docker container per project)
   │  - copy of the app template + codex CLI + the generated app's dev/prod server
   │  - `codex exec` (non-interactive) edits ONLY inside the template
   ▼
Reverse proxy (Caddy) — serves each app on a wildcard subdomain of *.<BASE_DOMAIN>
```

Key decisions (fixed):

- **One app template only:** Next.js (App Router) + SQLite via Drizzle ORM. All DB access goes through Server Actions / Route Handlers — no DB credentials ever reach the client.
- **Private by default:** generated apps sit behind a Discord OAuth gate at the proxy layer so only members of the originating server can access them. The MVP may simplify (signed link + session cookie), but the private-by-default principle is non-negotiable.
- **Codex edits only inside the template.** Auth, DB client init, and deploy config are fixed by humans in the template; Codex touches app logic and UI only (enforced via `templates/app-template/AGENTS.md`).
- **Local dev runs entirely on Docker Desktop.** Production target is a single VPS + Caddy, but the deploy target is abstracted behind a single interface in `packages/deploy`.

## Repository layout

```
/
├── CLAUDE.md
├── package.json            # pnpm workspace
├── apps/
│   ├── bot/                # discord.js bot + orchestrator
│   └── cli/                # M1: end-to-end build pipeline without Discord
├── packages/
│   ├── sandbox/            # Docker management, codex exec, event-stream parsing
│   ├── deploy/             # proxy registration + URL issuing (interface-abstracted)
│   └── shared/             # types & config
├── templates/
│   └── app-template/       # template for generated apps (Next.js + SQLite)
│       ├── AGENTS.md       # ★ instructions Codex reads at runtime
│       ├── app/            # Codex-editable area
│       └── ...             # auth / DB setup etc. — Codex must NOT edit
└── infra/
    ├── docker/             # sandbox image
    └── caddy/
```

## Milestones & current status

> Keep this table up to date. Update the Status column whenever a milestone advances.

| Milestone | Scope | Status |
|---|---|---|
| **M1** | CLI end-to-end: `pnpm cli build "<prompt>"` → copy template → start sandbox container → `codex exec` → quality loop → local URL printed to console. Codex event stream saved as structured logs. **No Discord.** | ✅ done 2026-07-18 (e2e: Japanese RSVP-app request → working app at http://localhost:4100, screenshots, structured logs in var/projects/demo-rsvp/) |
| **M2** | Discord: `/build` → create thread → stream progress (edit one status message + post screenshots) → post preview URL | ✅ done 2026-07-18 (e2e on a real server: Japanese book-vote-app request → thread + streamed progress + result embed + preview URL at http://localhost:4101; Codex event log in var/projects/app-415p0v/). `DEPLOY_MODE=cloudflared` (public quick-tunnel URLs) implemented but not yet exercised e2e — verify during M4 demo rehearsal. |
| **M3** | Edit loop: thread replies become edit tasks → diff summary post → redeploy. 👍×2 ship-approval gate | ✅ done 2026-07-19 (e2e on a real server: 2 edit rounds on the book-vote app — bright color scheme, then a footer — with vote data preserved; changes summary embed + screenshots + preview URL per build; ship vote → approval announced. `SHIP_APPROVAL_VOTES` env sets the threshold, 1 used for solo e2e, default 2) |
| **M4** | Demo polish: error recovery UX, Discord OAuth gate (simple version OK), rehearse demo scenario (community event RSVP app) | ⏳ not started |

**Current position: M3 complete and verified e2e — M4 (demo polish: cloudflared URL verification, simple OAuth/link gate, demo rehearsal) is next, after PR #8 merges.**
Verified so far: workspace installs & typechecks; CLI entry wired; template installs,
typechecks, `next build` passes, `db:push`/`db:seed` work, screenshot script captures
the running dev server. `codex` CLI 0.144.5 verified (see packages/sandbox/README.md).
Sandbox codex auth is mode-switched via `CODEX_AUTH_MODE`: `chatgpt` (default,
dev/testing — host's subscription auth.json copied into containers) and `api-key`
(final setup). See packages/sandbox/README.md for the exact mechanics.

Out of scope — do not build or propose: payments, multiple templates, fork/marketplace, web dashboard, mobile, multi-server scaling, real billing/user management.

## Commands

Root workspace:

| Command | Purpose |
|---|---|
| `pnpm install` | Install workspace dependencies |
| `pnpm cli build "<prompt>"` | M1 end-to-end build without Discord (pipeline lands at M1) |
| `pnpm dev` | Run the Discord bot + orchestrator (needs `DISCORD_BOT_TOKEN` / `DISCORD_CLIENT_ID` in `.env`) |
| `pnpm typecheck` | Typecheck across the workspace |
| `pnpm test` | Run tests across the workspace (none yet) |

Inside `templates/app-template/` (standalone — install with `pnpm install --ignore-workspace`):

| Command | Purpose |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js dev / production build / serve |
| `pnpm typecheck` | Typecheck the template |
| `pnpm db:push` / `pnpm db:seed` | Apply Drizzle schema to SQLite / run seed script |
| `pnpm screenshot [route ...]` | Playwright screenshots of the running dev server → `screenshots/` |

## Development rules

1. **TypeScript strict** everywhere. No `any` escapes without a comment explaining the constraint.
2. **YAGNI, demo-first.** Do not add features the demo does not need. Do not propose out-of-scope items.
3. **Verify e2e before commit at each milestone.** A milestone is done only after the golden path has actually been run end to end; report the verification result before moving on.
4. **Secrets live in `.env` only.** Never commit them. Keep `.env.example` current.
5. **Small commits, English commit messages.**
6. **Do not change decided architecture.** If implementation genuinely blocks on a decided item, stop and present the reason + an alternative to the user; do not silently deviate.
7. **`codex` CLI flags must be verified against `codex --help` / official docs before writing sandbox code.** Never guess the CLI surface.
8. Conversation with the user is in Japanese; code, comments, and all documents (including this file and AGENTS.md) are in English.
9. **From M2 onward: no direct commits to `main`.** Work on a feature branch (e.g. `feat/m2-discord`) and open a PR to `main` (decided 2026-07-18; M1 and earlier landed directly on `main`). Run the adversarial-review skill on milestone-sized changes before merging.
