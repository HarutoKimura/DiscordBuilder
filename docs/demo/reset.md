# Demo environment reset

Between rehearsal takes, remove the demo project completely so the next
`/build` starts from a clean slate. Existing OTHER projects (e.g. the
book-club app) are untouched — this is per-project.

## Steps

1. **Stop the bot** (Ctrl-C / SIGTERM). Its shutdown drains the queue, closes
   tunnels, and reclaims interrupted initial builds on its own.
2. **Destroy the project** (container + volumes + registry entry + files):

   ```sh
   ./scripts/reset-project.sh <projectId>
   ```

   The project id is in the thread's result flow, or look it up in
   `var/projects/registry.json`.
3. **Delete the Discord thread** (right-click → スレッドを削除) — thread
   bindings in `var/bot/threads.json` are cleaned by the script; the Discord
   side is manual.
4. **Restart the bot**: `pnpm dev`. Check the console for
   `deploy mode: cloudflared` before recording.

## Notes

- Quick-tunnel URLs change on every bot restart / new registration — that is
  expected; re-copy the URL from the newest result embed.
- If a take fails mid-build, the bot's failure path already destroys the
  initial build's container; the script is then only needed for the files
  and registry entry (it tolerates already-missing resources).
- Full nuke (every project) is intentionally NOT scripted — the book-club app
  is demo material for the "existing community apps" B-roll.
