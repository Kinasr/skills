---
name: setup-flow
description: "Initialize or update work-tracking config in .agents/work-tracking.md and passive rules in AGENTS.md."
license: MIT
disable-model-invocation: true
---

# setup-flow

One-time repository work-tracking initializer and idempotent config updater. Generates on-demand skill configuration in `.agents/work-tracking.md` (`Schema: 1`) and a standalone 4-line passive `## Work Tracking` block in `./AGENTS.md`, without modifying source code or auto-invoking other skills.

Use the exact schemas and merge rules in `./references/templates.md`.

---

## 1. Preflight & Run Context Header

1. **Probe local files & git state directly by path:**
   - Read `.agents/work-tracking.md` if present.
   - Read `./AGENTS.md` if present.
   - Check whether `./CLAUDE.md` or `.claude/CLAUDE.md` already exists (do **not** create either file if missing).
   - Scan `.github/` and `docs/agents/` (plus any path indicated by the user) for legacy work-tracking instructions or configs; read found files to prefill defaults.
   - Inspect current git branch (`git rev-parse --abbrev-ref HEAD`, falling back to `detached@<short-sha>`, `<unborn-HEAD>`, or `<no-git>`) and `git remote -v`.
2. **Determine config source and emit Run Context Header first:**
   - `Config: .agents/work-tracking.md` if `.agents/work-tracking.md` exists.
   - `Config: inferred (<remote>)` if `.agents/work-tracking.md` is absent and `git remote -v` resolves a GitHub/GitLab remote (if multiple remotes exist, ask the user which remote to target).
   - `Config: none (initializing)` if neither exists.
   - Print 1 line:
     `setup-flow | Config: <source> | Branch: <branch-or-fallback>`
3. **Probe tracker CLI/MCP & capabilities:**
   - Check installed tracker CLI/MCP (`gh`, `glab`, or user-specified `custom` CLI/MCP), authentication status, target repo/board binding, label/state management permissions, PR/MR join availability, and `native_deps` (whether native blocking-dependency APIs work in this environment).
   - If the chosen CLI/MCP is missing or unauthenticated, print concise install/auth instructions (never store credentials) and note whether the user wants to finish local file setup now or re-run after authenticating.
   - On `custom` CLIs/MCPs, explicitly disclose any unsupported operations (e.g., native dependency links or PR-link queries).

---

## 2. Collect Configuration

Read `./references/templates.md` and present prefilled defaults (from existing `.agents/work-tracking.md`, legacy files, or inferred remote) to confirm or customize every field:

1. `Tracker`: `github`, `gitlab`, or `custom`
2. `Tooling`: `tool=<cli_or_mcp>; target=<repo_or_board_id>; native_deps=true|false`
3. `Untriaged Signal`: `missing workflow label` (default) or explicit board intake column
4. `Workflow States`: `needs-info, ready:direct, ready:lite, ready:design`
5. `Excluded Active/Terminal States`: `in-progress, in-review, done, closed`
6. `Ticket Types`: `bug, feature, enhancement, chore, docs, epic`
7. `Priority Labels`: `none` (default) or comma-separated ordered labels
8. `Passive WIP Signal`: `open linked PRs` (default) or custom signal
9. `Lite Planner`: free-text user-facing hint (e.g., `Host built-in plan mode`; printed verbatim by `triage`, never auto-invoked)
10. `Full Planner`: free-text user-facing hint (e.g., `EGM design workflow`; printed verbatim by `triage`, never auto-invoked)
11. `Specs Path`: `docs/designs/` (default)
12. `Linking Rule`: `Blocked by <ID>, Parent: <ID>, Related to <ID>, Supersedes <ID>` (for `native_deps=false`; also written as prose `Blocked by` at creation)
13. `ID Pattern`: `none` (default) or custom regex override for non-standard ticket keys
14. `Max Backlog Scan`: `150` (default)
15. `Stale Days`: `30` (default)

Also ask the user:
- **Existing `CLAUDE.md` opt-in (only if `./CLAUDE.md` or `.claude/CLAUDE.md` already exists and lacks the import):** whether to insert `@AGENTS.md` (in `./CLAUDE.md`) or `@../AGENTS.md` (in `.claude/CLAUDE.md`) at the top of that file. Never create `CLAUDE.md` or `.claude/CLAUDE.md`.
- **Legacy files (only if detected):** whether to archive to `.agents/archive/`, remove, or keep them.
- **Workflow labels (if tracker supports labels and CLI/MCP is authenticated):** whether to initialize missing labels from `Workflow States`, `Ticket Types`, and `Priority Labels`.

---

## 3. Propose -> Approve -> Apply

### Propose (Preview)
Present a single consolidated preview before writing anything:
- Full proposed `.agents/work-tracking.md` (`Schema: 1`) using `./references/templates.md`, preserving any existing custom `## Notes` or repository notes idempotently.
- Exact 4-line `## Work Tracking` block for `./AGENTS.md` (showing diff against existing `./AGENTS.md` if present, preserving unrelated sections).
- Exact 1-line `@AGENTS.md` or `@../AGENTS.md` top insertion diff **only** for already-existing `./CLAUDE.md` / `.claude/CLAUDE.md` where the user opted in.
- Proposed legacy file archive (`.agents/archive/...`) or removal paths, if approved.
- Proposed workflow label creation list (or permission warning if token lacks label-write access).

### Approve
Wait for explicit user confirmation before making any local file writes or remote label calls.

### Apply
1. Write `.agents/work-tracking.md` and `./AGENTS.md`.
2. Update `./CLAUDE.md` and/or `.claude/CLAUDE.md` only if already present and explicitly approved.
3. Archive or remove legacy files only if explicitly approved.
4. Create missing workflow labels via `--` / JSON payloads if approved (warn and record failure if permissions are denied without rolling back valid local files).

---

## 4. Execution Receipt & Next Steps

Emit an Execution Receipt table summarizing every applied or skipped action:

| target_id | operation | outcome | URL/path | error/resume detail |
| --- | --- | --- | --- | --- |
| `.agents/work-tracking.md` | write config | APPLIED | `.agents/work-tracking.md` | `Schema: 1` |

Finish with harness-neutral next-step options (never auto-invoke another skill):
- To triage open issues: `run triage (/kinasr-skills:triage or /triage)`
- To audit the backlog graph: `run backlog-audit (/kinasr-skills:backlog-audit or /backlog-audit)`
- To slice a design spec into tickets: `run to-tickets (/kinasr-skills:to-tickets or /to-tickets)`
