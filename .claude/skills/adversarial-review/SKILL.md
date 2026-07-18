---
name: adversarial-review
description: >-
  Split-context adversarial code review, modeled on the process Bun used for its
  Rust rewrite (bun.com/blog/bun-in-rust): two independent reviewer subagents
  receive ONLY the diff — never the author's reasoning — assume the code is
  wrong, and must back every finding with a concrete failure scenario; an
  optional fixer applies confirmed findings, and the typecheck/test gate must
  pass. Use this whenever the user asks to review changes, a diff, a branch, or
  a commit ("review this", "adversarial review", "check my changes before I
  commit", "レビューして"), and before committing any milestone-sized change in
  this repo.
---

# Adversarial Review

The core idea, from Bun's Rust rewrite: **"the person writing the code wants to
merge the code, which can bias their actions."** The same bias applies to a
model reviewing code it just wrote, or code whose justification it has read.
So the review runs in contexts that have never seen the author's reasoning —
reviewers get the diff and the repo, nothing else, and they start from the
assumption that the code is wrong. The burden of proof is on the code.

Never review the diff yourself in this session — you may have written it or
read the reasoning behind it. Your job is orchestration, merging, and
verification only.

## Arguments

`/adversarial-review [ref-or-range] [--fix]`

- `ref-or-range` (optional): what to review, e.g. `HEAD~1..HEAD`, `abc1234`,
  `main..feature-x`. A single commit ref means "that commit's diff".
- `--fix`: after reporting, apply confirmed findings via the fixer stage.
  Without it, report only.

## Pipeline

### 1. Scope the diff

If no ref given, auto-detect in this order:
1. Uncommitted changes exist (`git status --porcelain` non-empty) → review
   `git diff HEAD` plus untracked files.
2. On a non-main branch → review `main...HEAD`.
3. Otherwise → review `HEAD~1..HEAD`.

Write the full diff to `<scratchpad>/review/diff.patch` and the changed-file
list to `<scratchpad>/review/files.txt`. Tell the user what scope was chosen
and its size before spawning reviewers.

If the diff exceeds ~3000 lines, split it into chunks along package/app
boundaries (one `diff-<pkg>.patch` per chunk) and run one reviewer pair per
chunk; everything below applies per chunk. Exclude pure lockfile /
generated-file churn (`pnpm-lock.yaml`, build output) from the patch — note
the exclusion in the report instead of spending review effort on it.

### 2. Spawn two independent reviewers

Spawn both Agent calls **in the same message** so they run in parallel. Build
each prompt from [references/reviewer.md](references/reviewer.md): read that
file, substitute `{DIFF_PATH}` and `{REPO_ROOT}`, and paste the result as the
subagent prompt.

The two prompts are identical except for the one **lens line** defined in
reviewer.md: Reviewer A digs first into semantic correctness and data flow;
Reviewer B digs first into error paths, resource lifecycle, and concurrency.
Both may report anything — the lens only sets where they start digging, and
buys perspective diversity without extra agents.

**Split-context rule (the point of this whole skill):** the reviewer prompt
contains the diff path, the repo path, and the charter — nothing else. Do not
include the conversation summary, the task description, the commit message
rationale, your opinion of the change, or hints about where bugs might be. If
a reviewer would need the spec to judge intent, it reads CLAUDE.md and the
code's own names/types/docs, like any cold reviewer would.

### 3. Merge and verify findings

Reviewers return structured findings (format defined in reviewer.md). Merge:

- Dedup by root cause (same underlying defect reported at different lines is
  one finding).
- Found independently by both reviewers → **CONFIRMED**.
- Found by one reviewer → read the actual file yourself and check whether the
  failure scenario holds. Holds → **CONFIRMED**. Can't confirm but can't
  refute → **PLAUSIBLE**. Refuted → drop it.
- Drop any finding without a concrete failure scenario, and pure style nits.
  A real finding names inputs/state and the wrong behavior that results.

### 4. Report

Rank most-severe first. If the `ReportFindings` tool is available, call it
once with the merged list (map CONFIRMED/PLAUSIBLE to `verdict`); otherwise
present a markdown list: `file:line — summary — failure scenario — verdict`.
Either way, state the scope reviewed, both reviewers' coverage, and what was
dropped in your final message. If both reviewers return NO_FINDINGS, report
that plainly along with where they dug — an empty result from a genuine hunt
is a valid outcome, not a failure of the skill.

Without `--fix`, stop here — findings are the deliverable. Do not start
fixing unless the user asks.

### 5. Fix (only with `--fix` or when the user asks)

Spawn one fixer subagent built from [references/fixer.md](references/fixer.md)
with the diff path and the CONFIRMED findings only (PLAUSIBLE ones go to the
user, not the fixer). The fixer fixes exactly what is listed — no refactors,
no scope creep — and reports per-finding outcomes.

### 6. Gate

After any fixes (and even without `--fix`, if the user plans to commit):
run `pnpm typecheck` at the repo root, and `pnpm test` once tests exist.
Report gate results plainly, failures included — a red gate is a result, not
something to soften. For milestone-sized changes, CLAUDE.md rule 3 still
applies on top of this: the golden path must be run e2e before the milestone
is called done.

## Rejection heuristics (bind reviewers, fixer, and you)

- The code is presumed wrong until the reviewer fails to break it.
- If a workaround needs a paragraph-long comment to justify why it's OK, the
  code is wrong — fix the code, don't write the paragraph.
- A finding without a concrete failure scenario is not a finding.
- Deleting, skipping, or weakening a test to make the gate pass is never a
  fix. (Bun's port shipped with "0 tests skipped or deleted".)
- When review keeps catching the same class of defect, say so in the report:
  fixing the process that generates the code beats hand-fixing its output.
