# Demo video script (3 minutes, with cut plan)

Golden path: one fresh `/build`, one edit, one approved ship. Everything else
is cut in editing. Record raw footage per scene; a scene that fails gets
re-recorded after a project reset (see [reset.md](reset.md)) — never splice a
broken take.

**Demo prompt (data-centric on purpose — the DB/full-stack story must be
visible):** a food-stall shift scheduler for a school festival.

**Language:** the entire video is in English — bot messages are English, the
demo prompts below are English (so Codex generates an English app), and the
narration is English (ElevenLabs voice clone; see [narration.md](narration.md)).

**Recording setup**

- PC screen: Discord (server with the bot) + browser side by side.
- Phone on CELLULAR (Wi-Fi off) for the public-URL moment, filmed or screen-recorded.
- `.env`: `DEPLOY_MODE=cloudflared`, `SHIP_APPROVAL_VOTES=2` (second voter:
  sub-account or friend). Solo fallback: `SHIP_APPROVAL_VOTES=1`.
- Bot freshly restarted; no leftover demo project (reset first).

## Scene plan

| Time | Scene | Notes |
|---|---|---|
| 0:00–0:15 | **Hook.** Text overlay over a busy Discord server: "Every community needs small tools. Nobody builds them." | One sentence, no narration needed. |
| 0:15–0:45 | **/build.** Type `/build request: A food-stall shift scheduler for our school festival. Each stall has time slots, members sign up for shifts, and everyone can see who is where.` → bot replies → thread appears → status message streaming (show ~8s of live updates: command count, file changes, Codex's own words). | Jump cut with a "⏩ 6 min later" caption. The streaming progress IS a feature — let it breathe for a few seconds. |
| 0:45–1:15 | **Result.** Completion embed: summary, changes list, screenshots, **"Open the app" button** → click → app fills the browser. Scroll once. | |
| 1:15–1:45 | **The multiplayer moment (the money shot).** Phone (cellular) opens the same `https://….trycloudflare.com` URL → register a shift entry ON THE PHONE → reload on PC → the entry is there. | Proves: public URL + real backend + real DB, in one beat. |
| 1:45–2:20 | **Edit loop.** Reply in thread: `Prevent double-booking — one member per slot per time period, and grey out full slots.` → "✏️ Edit request received" → jump cut → new embed → show the change working **and the phone-entered data still present**. | Data preservation is the trust story — say it out loud / caption it. |
| 2:20–2:50 | **Ship gate.** Vote message appears → 👍 from two accounts (show the "1 more needed" edit after the first vote) → 🚀 approval → **parent channel gets the launch announcement, thread gets ✅**. | The community's reaction literally released the app. |
| 2:50–3:00 | **Outro.** One architecture slide (Discord → orchestrator → Codex sandbox → tunnel), caption: "The conversation log IS the spec and the history." GitHub link. | |

## Narration

Full TTS-ready narration lives in [narration.md](narration.md) — one short
line per scene, timed to the cut plan above.

## Judging-criteria checklist (each must be visibly on screen)

- [ ] Codex integration substance: streaming Codex events in the status message (0:15–0:45), AGENTS.md/quality-loop mention in outro or README link.
- [ ] Non-developer usability: the entire flow is plain language inside Discord.
- [ ] Real problem: the hook + a genuinely useful app (shift table).
- [ ] Idea quality: multiplayer moment + vote-gated release + conversation-as-spec caption.
