# @discordbuilder/sandbox

Docker sandbox management, `codex exec` invocation, and Codex event-stream parsing.

## Codex CLI surface (verified against codex-cli 0.144.5, 2026-07-18)

Verified via `codex --help` / `codex exec --help` / `codex login --help` on the dev machine.
Do not re-guess these flags — if the CLI is updated, re-verify before changing this package.

- `codex exec [PROMPT]` — non-interactive run; prompt as argument or stdin
- `--json` — emits events as JSONL on stdout (our progress stream)
- `-m, --model <MODEL>` — model selection (we pass `CODEX_MODEL`, default `gpt-5.6-sol`)
- `-C, --cd <DIR>` — working root for the agent
- `-s, --sandbox <read-only|workspace-write|danger-full-access>` — codex's own sandbox policy
- `--dangerously-bypass-approvals-and-sandbox` — documented as intended for externally
  sandboxed environments; our per-project Docker container IS that external sandbox
- `--skip-git-repo-check` — required when the workdir is not a git repo
- `--ephemeral` — do not persist session files
- `-o, --output-last-message <FILE>` — write the agent's final message to a file
- Auth inside the container: `printenv OPENAI_API_KEY | codex login --with-api-key`

Planned invocation inside the sandbox container (implemented at M1):

```sh
codex exec --json --ephemeral --skip-git-repo-check \
  -m "$CODEX_MODEL" -C /workspace/app \
  --dangerously-bypass-approvals-and-sandbox \
  -o /workspace/last-message.txt \
  "<task prompt>"
```

## Event stream

The exact JSONL event schema is version-dependent and not documented in `--help`.
M1 captures a real run first and derives the parser from observed events. The parser
must stay tolerant: parse each line as JSON, keep the raw value, extract well-known
fields (`type`, message text) defensively, and never crash on unknown event shapes.
All events are persisted as structured logs per build.
