# Demo video script (3 minutes, with cut plan)

Golden path: one fresh `/build`, one edit, one approved ship. Everything else
is cut in editing. Record raw footage per scene; a scene that fails gets
re-recorded after a project reset (see [reset.md](reset.md)) — never splice a
broken take.

**Demo prompt (data-centric on purpose — the DB/full-stack story must be
visible):** 文化祭の屋台シフト表 (school-festival food-stall shift table).

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
| 0:15–0:45 | **/build.** Type `/build request: 文化祭の屋台シフト表を作って。屋台ごとに時間帯シフトを登録して、誰がどこに入るか一覧できるように` → bot replies → thread appears → status message streaming (show ~8s of live updates: command count, file changes, Codex's own words). | Jump cut with a "⏩ 6 min later" caption. The streaming progress IS a feature — let it breathe for a few seconds. |
| 0:45–1:15 | **Result.** Completion embed: summary, changes list, screenshots, **「アプリを開く」 button** → click → app fills the browser. Scroll once. | |
| 1:15–1:45 | **The multiplayer moment (the money shot).** Phone (cellular) opens the same `https://….trycloudflare.com` URL → register a shift entry ON THE PHONE → reload on PC → the entry is there. | Proves: public URL + real backend + real DB, in one beat. |
| 1:45–2:20 | **Edit loop.** Reply in thread: `シフトの重複登録を防いで、埋まってる枠はグレーアウトして` → "✏️ 受け付けました" → jump cut → new embed → show the change working **and the phone-entered data still present**. | Data preservation is the trust story — say it out loud / caption it. |
| 2:20–2:50 | **Ship gate.** Vote message appears → 👍 from two accounts (show the "あと1票" edit after the first vote) → 🚀 approval → **parent channel gets the launch announcement, thread gets ✅**. | The community's reaction literally released the app. |
| 2:50–3:00 | **Outro.** One architecture slide (Discord → orchestrator → Codex sandbox → tunnel), caption: "The conversation log IS the spec and the history." GitHub link. | |

## Narration skeleton (Japanese, one line per scene)

1. コミュニティには小さなツールがいつも必要です。でも作る人がいません。
2. Discord で頼むだけ。Codex が実装します。
3. 数分後、動くアプリとスクリーンショットが届きます。
4. URL は公開されていて、メンバーのスマホからそのまま使えます。データも本物です。
5. 直してほしければ、スレッドに返信するだけ。データは消えません。
6. そして、リリースはコミュニティの 👍 が決めます。
7. 会話ログが、仕様書であり開発履歴です。DiscordBuilder でした。

## Judging-criteria checklist (each must be visibly on screen)

- [ ] Codex integration substance: streaming Codex events in the status message (0:15–0:45), AGENTS.md/quality-loop mention in outro or README link.
- [ ] Non-developer usability: the entire flow is plain Japanese inside Discord.
- [ ] Real problem: the hook + a genuinely useful app (shift table).
- [ ] Idea quality: multiplayer moment + vote-gated release + conversation-as-spec caption.
