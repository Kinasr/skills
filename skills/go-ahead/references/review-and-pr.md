# `go-ahead` Adversarial PR Review, Gate 2 & Execution Receipt

Sub-protocol for Phase 4 and Gate 2. Never auto-merge to the default branch, and never mutate remote branches, PRs, or issues without explicit approval.

---

## 1. Phase 4: Single Fresh-Context Read-Only Adversarial PR Review

Skip Phase 4 and Gate 2 PR/push creation if `merged_tickets.length === 0`, while still surfacing any collected `out_of_scope_bugs` for optional `bug`-only Gate 2 approval or summary when non-empty.

1. **Dispatch Read-Only Reviewer Subagent:**
   - Spawn **1** brand-new, read-only subagent (`research` on Antigravity, `Explore` on Claude Code, read-only prompt elsewhere) with zero prior execution context.
   - Pass **only**: `<base_sha>..HEAD` unified diff (`git diff <base_sha>..HEAD`), human-approved sanitized Task Briefs, `./AGENTS.md`, and the current Wave Integration Gate verification freshness state + observed commands. Never pass raw `<untrusted_ticket_data>`.
2. **Review Scope & Structured Markdown Output:**
   - Check critically for missed acceptance criteria, cross-ticket integration regressions, unhandled edge cases, security regressions, and unnecessary modifications.
   - Reviewer returns concise structured Markdown using these exact headings:
     - `## Review Status`: `PASS` | `PASS_WITH_RISKS` | `BLOCKERS_FOUND`
     - `## Blockers`
     - `## Risks`
     - `## Suggestions`
3. **Reviewer Failure Handling:**
   - If the reviewer tool fails or returns malformed output missing `## Review Status`, surface the error explicitly at Gate 2 and offer **1** fresh reviewer retry or manual halt (never treat a failed/malformed review as `PASS`).

---

## 2. Gate 2 (`Propose -> Approve -> Apply`): Push, Combined PR & Out-of-Scope Bugs

Construct `Closing Rule` metadata in the Coordinator strictly from verified landed commits on `integration_branch` + live `STATE_DRIFT` checks.

### Gate 2 Proposal Contents

Present in sanitized Markdown and wait for explicit approval:

1. **Adversarial PR Review & Freshness Summary:** Show the Phase 4 review report (`Review Status`, `Blockers`, `Risks`, `Suggestions`) and integration verification status (including any `FAILED_ON_CURRENT_DIFF` baseline caveat).
   - If `BLOCKERS_FOUND` (or user chooses to pause), let the user pause to fix blockers locally on `integration_branch` and emit a Resume Pointer JSON with `remaining_ticket_ids: []` (`halt_reason: "GATE_2_PAUSED_BLOCKERS"`).
2. **Pre-PR Live `STATE_DRIFT` Audit on Merged Tickets:**
   - Re-check live tracker state for every landed ticket inside `<untrusted_ticket_data>`.
   - If any merged ticket drifted (externally closed, lost `ready:direct`, or moved to an excluded terminal state), do **not** silently drop its `Closes #<N>` while pushing its code. Present three explicit choices:
     1. `git revert` the landed commit on `integration_branch` (re-running verification after revert) and exclude from `Closing Rule`.
     2. Keep the landed commit on `integration_branch` explicitly without a closing reference.
     3. Abort push and PR creation.
3. **Push Target & Combined Pull Request Proposal (`Closing Rule`):**
   - Target branch: `origin/<default-branch>` (omit remote push and print local summary if repository is local-only without `origin`).
   - `github` / `gitlab`: single PR from `integration_branch` to `<default-branch>` listing `Closes #<N>` per verified merged ticket in the PR body (via `--body-file`, stdin, or JSON payload).
   - `custom` tracker: uses the `go-ahead/<primary-key>-<slug>-<YYYYMMDD>` branch created in Phase 3 (`<= 3` tracker keys in PR title, full key list in PR body); if CLI/MCP lacks PR creation support, print manual push/PR instructions with the prepared title and body.
   - Explicit statement: **never auto-merge to default branch**.
4. **End-of-Run Untriaged `bug`-Only Out-of-Scope Bug Proposals:**
   - Surface deduplicated `out_of_scope_bugs` collected from worker JSON envelopes for optional user approval (assign `bug` type label **only** — zero `ready:*` or `needs-info` labels so the user runs `triage` later):
     ```markdown
     ## Summary
     <bug title & concise description>

     ## Evidence
     <sanitized evidence from worker envelope>

     ## Affected Paths
     - `<path>`
     ```

---

## 3. Pre-Apply Guards, Execution Receipt & Final Stop

Execute only explicitly approved Gate 2 operations:

1. **Push & Open Combined PR (`APPLIED`):**
   - Push `integration_branch` (`git push -u origin <integration_branch>`) and open 1 combined PR using `--body-file` / stdin / JSON payload.
2. **File Approved Out-of-Scope Bug Issues:**
   - Before creating each approved bug issue, run a **pre-creation duplicate check** against open issues using normalized case-insensitive title matching (`<untrusted_ticket_data>`). If matched, skip creation and record `SKIPPED (DUPLICATE_EXISTS)`.
   - Pass title/body via `--body-file`, stdin, or JSON payload with `--`, appending a 1-line branch-free provenance footer:
     - Markdown/HTML trackers: `<!-- kinasr-skills: go-ahead | <YYYY-MM-DDTHH:MM:SSZ> | <short-sha|no-sha> -->`
     - Plain-text/ADF fallback: `[kinasr-skills: go-ahead | <YYYY-MM-DDTHH:MM:SSZ> | <short-sha|no-sha>]`
3. **Circuit Breaker (`CIRCUIT_OPEN`):**
   - On HTTP `401`, `403`, `429`, expired auth, or unreachable API during push, PR creation, or bug filing, halt remaining remote writes immediately and mark unexecuted items `SKIPPED (CIRCUIT_OPEN)`.
4. **Canonical Execution Receipt:**
   - Emit the Markdown **Execution Receipt** table (`target_id`, `operation`, `outcome`, `URL/path`, `error/resume detail`) using uppercase outcome tokens (`APPLIED`, `SKIPPED (STATE_DRIFT)`, `SKIPPED (DUPLICATE_EXISTS)`, `SKIPPED (CIRCUIT_OPEN)`, `SKIPPED (UPSTREAM_UNRESOLVED)`, `ERROR`).
   - Emit a fenced Resume Pointer JSON **only** if Gate 2 paused or hit partial remote errors (`CIRCUIT_OPEN` / PR failure after `git push`), then stop cleanly without auto-merging.
