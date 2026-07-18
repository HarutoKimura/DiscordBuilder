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

## Auth inside sandbox containers (CODEX_AUTH_MODE)

Two modes, selected by `CODEX_AUTH_MODE` (see `.env.example`):

- **`chatgpt` (default — dev/testing):** reuse the host's ChatGPT-subscription login.
  At container creation, copy the host's `$CODEX_HOME/auth.json` (default
  `~/.codex/auth.json`) into the container's `CODEX_HOME` (e.g.
  `docker cp` to `/root/.codex/auth.json`, mode 600). Copy — NOT a bind mount:
  parallel containers refresh tokens and would race on a shared file; the host
  file stays canonical and fresh copies go to new containers.
- **`api-key` (final/production):** run
  `printenv OPENAI_API_KEY | codex login --with-api-key` at container start
  (flag verified via `codex login --help`).

The auth file is a secret: never bake it into the image, never copy it into the
template directory, never log its contents.

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
