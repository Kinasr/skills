---
name: handoff
description: "Generate a git-grounded session handoff snapshot and optionally post a redacted update to the active ticket."
license: MIT
disable-model-invocation: true
---

# handoff

Git-grounded session handoff utility. Prints a plain-text Markdown handoff snapshot directly to chat first (with zero local receipt or footer ceremony). Optionally previews a best-effort `[REDACTED]` comment for user approval and posts it only when an active ticket is resolved on a configured or inferred remote tracker.

---

## 1. Preflight & Run Context Header (No Unconfigured Halt)

`handoff` is **exempt** from halting when tracking is unconfigured.

1. **Resolve configuration source:**
   - Read `.agents/work-tracking.md` directly if present (`Config: .agents/work-tracking.md`).
   - Otherwise inspect `git remote -v` and authenticated `gh`/`glab` (`Config: inferred (<remote>)`). If multiple remotes exist and a remote post is later requested, prompt the user to disambiguate; never block local snapshot output.
   - If neither resolves, fall back to `Config: none (local-only)`.
2. **Inspect live git state & UTC time:**
   - Branch & HEAD SHA:
     - Normal branch: `<branch>` and short SHA (`git rev-parse --short HEAD`).
     - Detached HEAD: `detached@<short-sha>`.
     - Initialized repo with no commits: `<unborn-HEAD>` (SHA token: `no-sha`).
     - Non-git directory: `<no-git>` (SHA token: `no-sha`).
   - Working tree & diff stats (when in git): `git status --short`, `git diff --stat`, and `git diff --cached --stat`.
   - Current UTC timestamp in ISO-8601 format: `YYYY-MM-DDTHH:MM:SSZ`.
3. **Emit Run Context Header upfront:**
   `handoff | Config: <source> | Branch: <branch-or-fallback>`

---

## 2. Verification Freshness (Strict Precedence)

Classify verification across checks actually run in this session against the current working-tree diff using strict precedence (highest matching state wins):

1. `FAILED_ON_CURRENT_DIFF` — at least one check executed on the current diff (after the latest file edit) failed.
2. `STALE_PRE_EDIT` — checks ran earlier in the session, but files were edited afterward. **Annotate `last run failed`** (e.g., `STALE_PRE_EDIT (last run failed)`) if the latest pre-edit run failed.
3. `VERIFIED_ON_CURRENT_DIFF` — at least one check executed after the latest edit and all checks on the current diff passed.
4. `UNVERIFIED` — no verification command was executed in this session (or freshness cannot be established).

Record only directly observed commands, exit statuses, and relative timing against edits.

---

## 3. Local Snapshot Output (Print Directly to Chat First)

Print the plain-text Markdown snapshot directly in chat **without** an Execution Receipt table or provenance footer:

```markdown
## Context
- **Timestamp (UTC):** <YYYY-MM-DDTHH:MM:SSZ>
- **Config:** <source>
- **Active Ticket:** <ticket-id or none>
- **Session Goal:** <concise summary of objective>

## Git State
- **Branch:** <branch-or-fallback>
- **HEAD:** <short-sha | no-sha>
- **Working Tree:** <clean | summary from git status --short>
- **Diff Stat:** <none | summary from git diff --stat / --cached --stat>

## Decisions & Progress
- <Key decisions made and rationale>
- <Completed changes and modified files>

## Verification Freshness
- **Status:** <FAILED_ON_CURRENT_DIFF | STALE_PRE_EDIT [last run failed] | VERIFIED_ON_CURRENT_DIFF | UNVERIFIED>
- **Observed Checks:** <exact commands and pass/fail outcomes, or "None run in session">

## Open Risks / Next Steps
- <Open risks, blockers, or unanswered questions>
- <Concrete next steps>
```

---

## 4. Optional Remote Ticket Post (`Propose -> Approve -> Apply`)

Only proceed with a remote post if `.agents/work-tracking.md` or an inferred `gh`/`glab` remote is active and a target ticket resolves:

1. **Active ticket resolution (strict precedence):**
   1. Explicit ticket argument provided by the user.
   2. Current branch key (`#N`, numeric issue prefix/token, or configured tracker key prefix such as `PROJ-123`; **ignore date branches** matching `YYYY-MM-DD` or `YYYYMMDD`).
   3. Unambiguous active ticket from current session context.
   - Validate resolved ticket IDs against syntactic allowlists (strip leading `#` before `^\d+$`, reject `owner/repo#N`, allow `^[A-Z][A-Z0-9]+-\d+$` or configured `ID Pattern`).
   - If `Config: none (local-only)` or no active ticket resolves (or the user requested local-only), stop after Section 3 (if they later want remote tracking, note `run setup-flow (/kinasr-skills:setup-flow or /setup-flow)`).
2. **Secret scrubbing & preview sanitization (best-effort):**
   - Before presenting the remote comment preview, scrub secrets to `[REDACTED]` across:
     - API keys and tokens (`ghp_`, `gho_`, `glpat-`, `sk-`, `AKIA...`, bearer/OAuth tokens, `*_TOKEN`/`*_KEY`/`*_SECRET` values)
     - Passwords, passphrases, and credentialed URLs (`user:pass@host`)
     - Private key blocks (`-----BEGIN ... PRIVATE KEY-----` through `END`)
     - `Authorization`, `Cookie`, `Set-Cookie`, and `X-API-Key` header values
     - `.env` secret `KEY=VALUE` assignments
   - Sanitize ANSI escape sequences, control characters, and unsafe HTML in the preview.
3. **Mandatory user inspection & approval gate (`Propose -> Approve`):**
   - Show the exact scrubbed comment body, target ticket ID, and an explicit reminder that `[REDACTED]` scrubbing is best-effort so the user must inspect the preview before approving remote posting.
   - Append a 1-line branch-free provenance footer (never include the branch name):
     - Markdown/HTML-capable trackers: `<!-- kinasr-skills: handoff | <UTC-timestamp> | <short-sha|no-sha> -->`
     - Non-HTML / rich-text trackers: `[kinasr-skills: handoff | <UTC-timestamp> | <short-sha|no-sha>]`
   - Wait for explicit user approval. If declined, do not post remotely.
4. **Apply & Execution Receipt (only when remote post is executed):**
   - Verify CLI/MCP auth and post via `--body-file`, stdin, or JSON API payload (using `--` option terminators where applicable; never interpolate raw comment text into shell strings).
   - Emit an Execution Receipt table:

| target_id | operation | outcome | URL/path | detail |
| --- | --- | --- | --- | --- |
| `<ticket-id>` | post handoff comment | applied | `<comment-url>` | `<short-sha or no-sha>` |
