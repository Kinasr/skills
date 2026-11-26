# Kinasr/skills — Multi-Harness Work-Orchestration Plugin Toolkit

* **Author:** kinasr
* **Status:** Proposed
* **Date:** 2026-11-26

---

## Overview

`Kinasr/skills` (currently holding only a placeholder `README.md` with `# skills`) is designed as a public, MIT-licensed plugin toolkit (`kinasr-skills`) targeting AI coding agents across Antigravity and Claude Code on macOS, Windows, and Linux. It will ship five user-invoked skills (`setup-flow`, `triage`, `backlog-audit`, `to-tickets`, `handoff`) that coordinate repository tracking setup, ticket triage, single-repo dependency graph checks, post-plan slicing, and git-grounded session handoff snapshots around external planners—defaulting to [EGM (Elephant-Goldfish Model)](https://github.com/google/elephant-goldfish-model) for full design (`ready:design`) and the host's built-in plan mode for light design (`ready:lite`)—without controlling code implementation.

Each onboarded repository keeps a standalone compact `## Work Tracking` passive block (`Closing Rule`, `Pre-Implementation Check`, optional config pointer) in root `./AGENTS.md` while storing skill-only tracker configuration in on-demand `.agents/work-tracking.md`. Otherwise unconfigured GitHub/GitLab repositories infer tracker defaults via `git remote -v` and `gh`/`glab`, and every mutating skill enforces `Propose -> Approve -> Apply`.

## The Problem

1. **Gap around planning tools:** Design workflows such as EGM shape and review specifications while coding agents implement code freely, yet target repositories lack a small, portable layer coordinating upstream issue intake, open-backlog dependency checks, post-plan slicing into parallel work, or cross-session handoff snapshots.
2. **Coupling and portability breaks in existing skill kits:** Bundling coding, TDD, and PR-formatting checklists overrides host-native coding workflows and adds context overhead. Shipping static adapter files outside skill folders breaks relative path resolution when individual skill folders are copied standalone, custom per-tracker wrapper scripts multiply API/auth maintenance, and git symlinks fail default Windows checkouts.
3. **Silent failure modes in repositories:** Treating missing labels as untriaged collides with native board columns (which always hold an initial status) and active work. Putting large tracker schemas in auto-loaded `AGENTS.md` consumes context on every non-tracking turn and leaks into isolated review contexts, while Claude Code ignores `AGENTS.md` whenever `CLAUDE.md` exists unless explicitly imported. Default CLI/MCP pagination silently drops page-2+ blockers during audits, and uncoordinated parallel batch triage violates intra-batch dependencies and host subagent limits.

`Kinasr/skills` addresses this by keeping each skill self-contained under `skills/<name>/`, splitting the standalone passive `./AGENTS.md` block (with opt-in `@AGENTS.md` import when `CLAUDE.md` already exists) from on-demand `.agents/work-tracking.md` config, falling back to `gh`/`glab` remote inference, separating readiness from blockage and lifecycle state, enforcing bounded paginated reads with reference closure, and running batch triage in topological subagent waves where supported.

## Goals

* Deliver `kinasr-skills` (MIT) as a cross-platform (macOS, Windows, Linux) plugin targeting Antigravity (planned pre-release verification) and Claude Code (planned CI metadata validation and post-release verification) with zero git symlinks and self-contained `skills/<name>/` directories.
* Ship five user-invoked, bare-named skills (`setup-flow`, `triage`, `backlog-audit`, `to-tickets`, `handoff`) keeping `SKILL.md` concise via skill-local `references/` sub-protocols, never auto-invoking each other, and enforcing `Propose -> Approve -> Apply` with execution receipts on mutating tracker writes.
* Keep always-on rules in `./AGENTS.md` minimal and standalone (proposing `@AGENTS.md` only when `CLAUDE.md` already exists and the user opts in) while storing tracker tooling, `Lite Planner` / `Full Planner` hints, and scan bounds in on-demand `.agents/work-tracking.md`, supporting zero-config `gh`/`glab` inference via `git remote -v`.
* Separate three orthogonal axes—Triage Readiness (`needs-info`, `ready:direct`, `ready:lite`, `ready:design`, omitting any `needs-triage` intake label), Execution Blockage (`Blocked by`), and Active/Terminal Lifecycle Exclusions—and separate backlog views into **Actionable Frontier**, **Active WIP (Open PR / In-Progress)**, and **Blocked Queue**.
* Enforce bounded reads and validated, user-approved writes: bounded paginated fetches with reference closure, truncation/count disclosure, confirmed vs. suspected signal separation, syntactic ID allowlists plus safe query/mutation argument passing, topological-wave batch triage (halting with a warning on hosts without subagents), pre-creation duplicate checks, and fail-safe mutation ordering.
* Validate cross-manifest metadata parity, `SKILL.md` frontmatter presence and required keys, zero symlinks (including git symlink index entries), contract parity, and skill boundary rules in automated cross-OS CI.

## Non-Goals

* Coding, TDD, debugging, code review, or PR-formatting skills (implementation remains unscripted for the coding agent).
* Plugin-root `references/trackers/*.md` adapter files or custom per-tracker CLI wrapper scripts.
* Built-in local Markdown file task tracking in v1 (deferred to [#1](https://github.com/Kinasr/skills/issues/1)).
* Multi-harness manifests for Codex, Cursor, or generic `skills/` installers in v1 (deferred to [#2](https://github.com/Kinasr/skills/issues/2)).
* Automatic skill-to-skill invocation.
* Sequential single-context batch triage on hosts that lack fresh-context subagents.
* Hardcoded harness-specific planner slash commands inside skill logic.
* Bundled MCP servers or credential/OAuth storage.

## Critical User Journeys (CUJs)

### CUJ 1: One-Time Repository Onboarding (`setup-flow`)

* **Given:** A repository with or without `AGENTS.md` and `CLAUDE.md` (or `.claude/CLAUDE.md`), where the developer uses an existing tracker CLI/MCP (`github`, `gitlab`, or `custom`).
* **When:** The user invokes `setup-flow`, answers structured setup prompts (tracker, tooling, untriaged signal and excluded active/terminal states, ticket types, optional priority labels, Lite/Full planner hints, specs path), and reviews missing CLI/MCP install or auth steps if needed.
* **Then:** The skill previews `.agents/work-tracking.md`, the standalone 4-line passive `## Work Tracking` block in `./AGENTS.md`, an `@AGENTS.md` pointer at the top of root `./CLAUDE.md` (or `@../AGENTS.md` in `.claude/CLAUDE.md`) only when that file already exists and the user opts in, optional archiving/removal of legacy tracker files, and optional workflow label initialization, applying changes only after explicit approval and printing an execution receipt.

### CUJ 2: Single-Ticket and Topological-Wave Batch Triage (`triage`)

* **Given:** `.agents/work-tracking.md` is present (or the repository exposes a GitHub/GitLab `git remote -v` matched by authenticated `gh`/`glab`), and one or more open issues exist (unlabeled or matching the configured untriaged signal, or open `needs-info` items, excluding active PR WIP unless explicitly targeted).
* **When:** The user runs single-ticket `triage` (e.g., `#42`) or batch `triage` (explicit IDs or `untriaged`, capped at 10 tickets).
* **Then:**
  * **Single Mode:** The agent normalizes multi-label readiness conflicts or warns and confirms before re-triaging `epic`/excluded-state/PR-WIP items, resolves `needs-info` replies or inspects codebase impact and external blockers, routes per the readiness rubric (`needs-info`, `ready:direct`, `ready:lite`, `ready:design`), applies approved tracker updates, emits an execution receipt, and stops without editing source code.
  * **Batch Mode:** The agent checks subagent availability first (halting with a context warning naming the top-priority single-ticket `triage` command if unavailable). Otherwise it fetches batch metadata once (excluding cyclic items for `backlog-audit` and flagging out-of-cap untriaged blockers), dispatches isolated read-only subagent workers in topological waves (defaulting to parallel waves with 1-at-a-time isolated subagent fallback on spawn/rate-limit errors), presents a dry-run approval table (where interactive upstream overrides or apply-time upstream drift mark dependent rows to skip for recheck, alongside cyclic items routed to `backlog-audit` and failed workers routed back to `triage` retry), applies approved edits, emits an execution receipt, and stops without editing source code.

### CUJ 3: Bounded Backlog & Dependency Graph Audit (`backlog-audit`)

* **Given:** A single repository with open issues across multiple states, dependency links (`Blocked by`, `Parent`, `Supersedes`), open PRs/active work, and epics.
* **When:** The user invokes `backlog-audit`.
* **Then:** Without deep code reads or commit-history heuristics, the skill runs a bounded paginated fetch with reference closure, reports scan coverage/truncation telemetry, separates confirmed links/PR signals from suspected prose matches, surfaces **Actionable Frontier (Unblocked `ready:direct`)**, **Active WIP (Open PR / In-Progress)**, **Blocked Queue**, `needs-info`, planning queues (`ready:lite` / `ready:design`), untriaged items, open superseded tickets, and broken or cyclic dependency links, and applies only explicitly approved housekeeping actions with close rationale comments, provenance footers, and an execution receipt.

### CUJ 4: Post-Plan Vertical Slicing (`to-tickets`)

* **Given:** A completed design spec in the configured specs path (or an inline Lite plan) and initialized tracking via `.agents/work-tracking.md` or inferred `gh`/`glab` remote defaults.
* **When:** The user invokes `to-tickets` targeting the finished spec or plan (or `--resume` with a prior partial-failure receipt).
* **Then:** The skill verifies spec anchors and checks dirty/untracked git state, scans bounded open-ticket metadata plus targeted keyword searches for overlaps without mutating existing tickets, proposes a dry-run tree of PR-sized vertical slices (attaching `Supersedes <origin-ID>` when slicing from a planned non-`epic` origin ticket—or `Parent: <origin-ID>` when the origin is already an `epic`—plus a follow-up `backlog-audit` cleanup recommendation), creates parents/unblocked slices before dependents after approval, and outputs an execution receipt (with resume state on partial failure).

### CUJ 5: Grounded Session Handoff (`handoff`)

* **Given:** An active engineering session with decisions made, modified files, and verification runs (with or without `.agents/work-tracking.md` or an inferred `gh`/`glab` remote).
* **When:** The user invokes `handoff` before closing or switching sessions.
* **Then:** The skill prints a plain-text Markdown snapshot directly to chat first—built from live git status/diff/HEAD (with unborn/non-git fallbacks), ISO-8601 UTC timestamp, and explicit four-state verification freshness—without local batch-receipt or footer ceremony. When `.agents/work-tracking.md` or an inferred remote resolves an active ticket, it separately previews a best-effort `[REDACTED]` scrubbed comment for mandatory user inspection and confirmation before posting remotely and emitting an execution receipt.

## Technical Plan (Architecture)

### 1. Repository & Multi-Harness Packaging Architecture (Zero Symlinks)

`kinasr-skills` packages a single plugin tree with zero git symlinks so Windows checkouts and manual directory copies do not fail due to symlink permissions:

```text
skills/                                      # Repository root (Kinasr/skills)
├── plugin.json                              # Antigravity root manifest (no $schema key)
├── README.md
├── LICENSE                                  # MIT
├── .claude-plugin/
│   ├── plugin.json                          # Claude Code manifest
│   └── marketplace.json                     # Claude plugin catalog
├── skills/
│   ├── setup-flow/
│   │   ├── SKILL.md
│   │   └── references/templates.md
│   ├── triage/
│   │   ├── SKILL.md
│   │   └── references/batch-wave.md
│   ├── backlog-audit/
│   │   ├── SKILL.md
│   │   └── references/audit-rules.md
│   ├── to-tickets/
│   │   ├── SKILL.md
│   │   └── references/slice-rules.md
│   └── handoff/
│       └── SKILL.md
├── scripts/
│   ├── validate-repo.mjs                    # Node.js 20+ stdlib repository validator
│   └── validate-repo.test.mjs               # Built-in node:test positive/negative suite
└── .github/
    └── workflows/
        └── validate.yml                     # Matrix: ubuntu-latest, macos-latest, windows-latest
```

* **Self-Contained Skill Directories:** Each `skills/<name>/` folder contains everything needed at runtime (including explicit skill-local `references/*.md` files for large templates and sub-protocols), with zero plugin-external references (`../` or plugin-root `references/`/`scripts/`), while permitting skills to read target-repository files (`./AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md`, `.agents/work-tracking.md`, `docs/designs/`). Keeping each `skills/<name>/` directory self-contained preserves compatibility with standalone skill folder copies and future multi-harness expansion ([#2](https://github.com/Kinasr/skills/issues/2)).
* **Directory-Level Discovery & Planned Support Tiers:** All manifests resolve skills from `./skills/`, allowing new personal skills under `skills/` without editing manifest lists. Root `plugin.json` omits `$schema` (preventing strict root-schema validation issues) and omits `"skills"` (defaulting to `./skills/`). Planned verification and support tiers are structured as follows (none executed before Phase 1–4 completion): (a) **planned pre-release runtime targets:** `Antigravity CLI` (`agy`, using `invoke_subagent`, Antigravity's fresh-context subagent tool) and manual `Antigravity App` (desktop app) folder copy (`standalone Antigravity IDE` lacks `invoke_subagent`, and interactive command forms in both `Antigravity App` and `Antigravity for IDEs` extension remain unverified until tested); and (b) **planned pre-release CI metadata validation and post-release manual runtime target:** `Claude Code`. Manifests for Codex CLI, Cursor, and generic `skills/` installers are deferred to [#2](https://github.com/Kinasr/skills/issues/2). The [EGM Harnesses Guide](https://github.com/google/elephant-goldfish-model/blob/main/docs/harnesses.md) documents EGM's host constraints rather than `kinasr-skills` test results.
* **Manual Invocation & Bare Names:** Every `SKILL.md` declares `disable-model-invocation: true`. Bare command names (`setup-flow`, `triage`, `backlog-audit`, `to-tickets`, `handoff`) avoid verbose prefixes; `README.md` will instruct users to back up or remove conflicting pre-existing standalone local skills (such as `~/.gemini/config/skills/triage/` or `~/.claude/skills/triage/`) and delete the existing plugin directory before reinstalling on manual upgrades.

### 2. Split Repository Configuration Contract (`./AGENTS.md` + `.agents/work-tracking.md`)

To keep always-on prompt overhead minimal on coding turns and prevent skill-only tracker schemas from leaking into isolated review contexts, repository configuration is split into two files:

#### Always-On Passive Rules (`./AGENTS.md` — 4-line block: heading plus 3 rules)

```markdown
## Work Tracking
- **Closing Rule:** `Closes #<N>` in PR body | tracker key in branch/PR title
- **Pre-Implementation Check:** `ready:direct` means scope-ready only; verify all `Blocked by` items are closed and check merged upstream diffs before coding
- **Config:** `.agents/work-tracking.md`
```

#### On-Demand Skill Configuration (`.agents/work-tracking.md` — `Schema: 1`)

Read strictly on demand by the 5 skills—never loaded on regular coding turns, where coding agents rely solely on standalone `./AGENTS.md`—supporting `github`, `gitlab`, and `custom` (Jira, Linear, etc. via CLI/MCP). Uses `# Work Tracking Config`, `Schema: 1`, and `- **Key:** value` entries (comma-separated lists) covering `Tracker`, `Tooling` (including `native_deps`, whether the tracker exposes native blocking dependency APIs), `Untriaged Signal`, `Workflow States`, `Excluded Active/Terminal States`, `Ticket Types`, optional `Priority Labels` (`none` default), `Passive WIP Signal` (`open linked PRs` default), `Lite Planner` and `Full Planner` (free-text user-facing workflow hints printed verbatim by `triage`, never auto-invoked), `Specs Path`, `Linking Rule` (`Blocked by <ID>`, `Parent: <ID>`, `Related to <ID>`, `Supersedes <ID>` for `native_deps=false`), optional custom `ID Pattern`, `Max Backlog Scan`, and `Stale Days` (exact templates in `skills/setup-flow/references/templates.md`). Skills probe custom CLI/MCP tracker capabilities at runtime and disclose unsupported operations (such as native links or PR joins).

#### Zero-Config Fallback & Cross-Harness Loading

When `.agents/work-tracking.md` is absent, tracking skills inspect `git remote -v` and authenticated `gh`/`glab` CLIs. If multiple GitHub/GitLab remotes exist (`origin` vs. `upstream`), skills prompt the user to disambiguate before proceeding. On a matched repository, skills infer standard defaults—including `native_deps=false` unless native blocking queries probe available, `Excluded Active/Terminal States` (`in-progress`, `in-review`, `done`, `closed`), `epic` intake and Frontier exclusion, `Passive WIP Signal` (`open linked PRs`), `needs-info`/`ready:*` workflow labels, and `docs/designs/` specs path—and probe target-repo label existence in Preflight (previewing missing workflow label creation or warning on missing permissions), otherwise halting and instructing the user to run `setup-flow` (except `handoff`, which runs local-only). Because Claude Code ignores `AGENTS.md` whenever `CLAUDE.md` exists, `setup-flow` probes existing root `CLAUDE.md` and `.claude/CLAUDE.md` files, and—only when one already exists and the user opts in—proposes inserting `@AGENTS.md` (in `./CLAUDE.md`) or `@../AGENTS.md` (in `.claude/CLAUDE.md`) via `Propose -> Approve -> Apply` without creating a new `CLAUDE.md`.

### 3. Three-Axis State Model & End-to-End Orchestration Flow

The system separates **Triage Readiness**, **Execution Blockage**, and **Lifecycle Status** so blocked work, active WIP PRs/in-progress items, and active/epic containers stay isolated from the untriaged queue and runnable frontier:

```text
  ┌──────────────────────────(needs-info replies)──────────────────────────────┐
  ▼                                                                            │
[Intake] ──(triage)────┬──▶ needs-info ─────────────────────────────────────────┘
                       ├──▶ ready:lite ──▶ Lite Planner ──┐
                       ├──▶ ready:design ─▶ Full Planner ─┼─(to-tickets)─┐
                       └──▶ ready:direct ─────────────────┴──────────────▼
                                                         [Triage Readiness = ready:direct]
                                                                          │
          ┌──────────────────────(Execution & WIP)────────────────────────┼───────────────────┐
          ▼                                                               ▼                   ▼
  [Actionable Frontier]                                          [Active WIP (Open PR /   [Blocked Queue]
  (ready:direct, not in Excluded Active/                         In-Progress)]             (open Blocked by)
   Terminal States, unblocked, no open PR, non-epic)             (open linked PR or               │
          │                                                       active in-progress/             │
          │                                                       in-review state)                │
          └──────────────────────▶ [Unscripted Implementation] ──▶ [Closing Rule] ◀──(unblocked)──┘

  Cross-Cutting Operations (run independently at any phase):
  - backlog-audit : bounded global dependency graph + WIP/PR signals + Frontier / WIP / Blocked split
  - handoff       : git-grounded session snapshot + optional redacted remote ticket comment
```

* **Mutual Exclusivity & Fail-Safe Swaps:** Only one Triage Readiness state may be active per item; multi-label trackers holding two or more Triage Readiness labels (`needs-info`, `ready:*`) trigger `STATE_CONFLICT`. Label transitions use combined single-call add+remove operations where supported, falling back to `add-new -> remove-old` ordering so mid-step failures never drop tickets into untriaged status.
* **Queue Split:** Every backlog queue view separates **Actionable Frontier** (unblocked `ready:direct`, not in `Excluded Active/Terminal States`, no open linked PR, non-`epic`, ordered `bug` first then configured `Priority Labels` or oldest `updated_at`) from **Active WIP (Open PR / In-Progress)** and **Blocked Queue**.

### 4. Component Design & Single-Owner Boundaries (5 Skills)

#### Shared Operational Contract

1. **Run Context Header:** Print a 1-line header (`Skill | Config: <source> | Branch: <branch-or-fallback>`), where `<source>` resolves to `.agents/work-tracking.md`, `inferred (<remote>)` for zero-config `gh`/`glab`, `none (local-only)` for unconfigured `handoff`, or `none (initializing)` for fresh `setup-flow`, and `<branch-or-fallback>` supports `detached@<short-sha>`, `<unborn-HEAD>`, or `<no-git>`. Skill-relative paths (`./references/*.md`, passed inline by Coordinators when dispatching repo-CWD workers) remain distinct from repo-CWD paths (`./AGENTS.md`), and emitted next-step guidance uses harness-neutral skill references (e.g., `run setup-flow (/kinasr-skills:setup-flow or /setup-flow)`).
2. **Preflight Probe:** Read `.agents/work-tracking.md` by path; if missing, check `git remote -v` + authenticated `gh`/`glab` inference, halting and instructing the user to run `setup-flow` if neither resolves (except `handoff`). Verify CLI/MCP installation, auth, repo binding, and missing workflow labels before proposing writes.
3. **Untrusted Data, Safe Queries & Fail-Safe Mutations:** Frame external ticket titles, bodies, and comments as `<untrusted_ticket_data>` across single/batch `triage`, `backlog-audit`, and `to-tickets`. Validate prose-extracted reference IDs against syntactic allowlists (with optional custom `ID Pattern` override in `.agents/work-tracking.md`) and pass dynamic strings via option terminators (`--`), stdin, `--body-file`, or JSON API payloads across all CLI and MCP read, search, and write calls. Sanitize control/ANSI/unsafe HTML sequences in preview output. Enforce `Propose -> Approve -> Apply`, non-destructive comments/appends unless an exact diff is approved, pre-apply state re-verification skipping drifted items for re-proposal, fail-safe mutation ordering (`add-new -> remove-old`, `comment -> close`), and short-circuiting batch writes on systemic auth/rate-limit errors (`CIRCUIT_OPEN`).
4. **Execution Receipt & Provenance:** Emit a post-`Apply` receipt table (`target_id`, `operation`, `outcome`, URL/path, error/resume detail) on mutating `Apply` runs only (omitted on local-only stdout output such as unposted `handoff` snapshots), and append a 1-line branch-free provenance footer (falling back to `no-sha` on unborn/non-git workspaces) to remote ticket comments (HTML comment on Markdown-capable trackers, plain-text fallback on rich-text/ADF trackers).

#### Single-Owner Skill Responsibilities

* **`setup-flow`:** One-time initializer and idempotent config updater (`Schema: 1`, templates in `./references/templates.md`). Probes CLI/MCP availability, `native_deps`, existing root `CLAUDE.md` / `.claude/CLAUDE.md`, and user-indicated or existing legacy tracking files under `.github/` or `docs/agents/` (prefilling defaults and proposing archive to `.agents/archive/` or removal on approval). Prompts for tracker (`github`, `gitlab`, `custom`), `Tooling:`, states, `Priority Labels`, `Lite Planner`/`Full Planner` hints, specs path, and `ID Pattern`; previews `.agents/work-tracking.md`, the standalone `./AGENTS.md` block, opt-in `@AGENTS.md` / `@../AGENTS.md` insertion (only when `CLAUDE.md` / `.claude/CLAUDE.md` already exists and the user opts in), legacy cleanup, and workflow label initialization before applying.
* **`triage`:** Owns code-aware readiness and newly discovered dependencies for 1 ticket or up to 10 tickets (`>10` prioritizes existing `bug` items then oldest `created_at` ascending, reporting remaining count).
  * *Readiness Classification Rubric:* Routes into `needs-info` (missing repro steps or contradictory/unanswered blocking acceptance criteria unresolvable from code), `ready:direct` (unambiguous acceptance criteria, localized single-PR scope, zero open architectural/schema/security trade-offs, paired with a 3-line plan: target files/symbols, core behavior change, verification check), `ready:lite` (clear problem with small trade-offs across 1–2 components, printing the `Lite Planner` hint verbatim), or `ready:design` (cross-cutting architecture, schema, security, or multi-PR slicing, printing the `Full Planner` hint verbatim).
  * *Single Mode:* Proposes normalization on `STATE_CONFLICT`, probes `Passive WIP Signal` (`open linked PRs`), warns and requests confirmation before re-triaging `epic`, excluded active/terminal states (`in-progress`, `in-review`, `done`, `closed`), or active-PR items, resolves `needs-info` threads or inspects source paths and blockers, persists `Blocked by` edges and the 3-line plan per tracker mode, applies approved edits, and stops without modifying source code.
  * *Batch Mode (`./references/batch-wave.md`):* Probes subagents first (halting on absence with top single-ticket `triage` command warning after explicit IDs or 1 metadata list fetch). Otherwise runs one Coordinator fetch excluding active PR WIP (unless explicitly passed), tags cycles `CYCLE_BLOCKED` and non-cyclic dependents of cycles `UPSTREAM_UNRESOLVED` (excluding both from dispatch and `Apply`, routing `CYCLE_BLOCKED` to `backlog-audit`), and flags out-of-cap untriaged blockers `BLOCKED_BY_UNTRIAGED` while still dispatching them in Wave 1. Dispatches read-only workers in topological waves (`Blocked by` edges; bounded concurrency with 1-at-a-time isolated subagent sequential fallback), selecting the active host's built-in read-only profile (`research` in Antigravity, `Explore` in Claude Code, or general-purpose subagent + prompt-only read-only constraints elsewhere). Workers return envelope JSON (`ticket_id, execution_status: OK|TIMEOUT|ERROR, inspected_paths, recommended_state, type, blockers, plan_lines, questions, rationale, error_detail` with nullable fields and non-JSON output mapped to `ERROR`/`UNRESOLVED`). Coordinator forwards compact `Wave k` summaries to dependent `Wave k+1` workers (attaching upstream-blocker warning notes when `Wave k` resolves to `needs-info`/`ready:design` without capping Readiness), routes runtime worker failures (`UNRESOLVED`/`UPSTREAM_UNRESOLVED`) to `triage` retry, cascades `NEEDS_RECHECK` transitively on interactive overrides or `Apply`-time `STATE_DRIFT`, skips excluded/recheck rows on `Apply` (`SKIPPED (CIRCUIT_OPEN)` on systemic `401`/`403`/`429`), emits Execution Receipt, and stops without editing source code.
* **`backlog-audit`:** Owns single-repo backlog dependency graph health without deep code reads or commit-history heuristics (`./references/audit-rules.md`).
  * *Bounded Discovery:* Runs CLI/API-projected Pass-1 field reads (extracting `Blocked by`, `Parent:`, and `Supersedes` across full bodies prior to snippet truncation; partitioning priority/stale/general slices where filters exist, or disclosing newest-work truncation), cross-status Pass 1.5 reference closure (including PR-linked issue IDs, tagging overflow past cap as `UNVERIFIED (REF_CAP_REACHED)`), Pass-2 ambiguous body excerpts, and bounded open PR inspection (`unsupported` notice if unavailable), disclosing exact scanned/truncated counts, prompting scoping filters, and verifying/suppressing unverified dangling-ID and closeable-epic errors when truncated.
  * *Health & Output:* Detects cycles, closed blockers, verified dangling IDs, native-vs-prose drift, open `epic` containers (`>= 1` child) with all children closed, open tickets targeted by `Supersedes <ID>`, `STATE_CONFLICT`, and stale items past `Stale Days` (including stalled `in-progress`/`in-review`, exempting epics with open non-stale children; routing code staleness to `triage`). Separates confirmed signals from suspected prose matches, emits a Quantitative Health Summary alongside Frontier / Active WIP (Open PR / In-Progress) / Blocked Queue splits, and posts rationale comments before closing approved items.
* **`to-tickets`:** Owns post-plan vertical slicing without mutating existing tickets (`./references/slice-rules.md`).
  * *Inputs & Scan:* Validates committed spec file and GitHub-style normalized heading anchors (or whole-file slicing on unanchored paths, confirming if untracked/dirty), or accepts inline Lite plans (omitting `spec`). Scans bounded open-ticket metadata plus targeted keyword overlap searches per slice.
  * *Slicing, Execution & Resume:* Proposes PR-sized vertical slices (`ready:direct`, sections `## Summary`, `## Acceptance Criteria`, `## Links`; minting 1 parent `epic` with no `ready:*` intake label when `>=3` spec slices share a spec, or optionally on `>=3` inline slices upon confirmation); when slicing from a planned origin ticket, uses `Parent: <origin-ID>` only if already an `epic`, otherwise attaches `Supersedes <origin-ID>` on the minted `epic` (or slices) and recommends follow-up `backlog-audit` cleanup. Handles overlaps via `link` (`Related to <ID>`), `skip` (rebinding dependents to the existing ID), or `supersede` (`Supersedes <ID>` + `backlog-audit` cleanup note); writes prose `Blocked by` at creation even when `native_deps=true`; and consumes fenced JSON receipts via `--resume` (chat/session or optional file path).
* **`handoff`:** General-purpose session handoff snapshot utility. Inspects live git status, diff stat, HEAD SHA, ISO-8601 UTC timestamp, and four-state verification freshness (`FAILED_ON_CURRENT_DIFF` > `STALE_PRE_EDIT` > `VERIFIED_ON_CURRENT_DIFF` > `UNVERIFIED`), printing a plain-text Markdown snapshot directly to chat first without local receipt or footer ceremony. Only when `.agents/work-tracking.md` or an inferred remote resolves an active ticket (`explicit arg > branch key > session context`), applies best-effort `[REDACTED]` secret scrubbing and presents a separate approval preview before posting a remote comment (emitting provenance footer and Execution Receipt only when posted).

### 5. Offline CI Validation Architecture (`scripts/validate-repo.mjs`)

A zero-dependency Node.js 20+ CLI validator and `node:test` suite (`scripts/validate-repo.test.mjs`) run locally and across Linux, macOS, and Windows CI to verify:
1. Zero symlinks outside `.git` (via filesystem `lstat` and git index mode inspection), plus non-empty `LICENSE` and `README.md`.
2. JSON syntax validity and cross-manifest metadata/required-field parity across the explicit 3-file manifest and catalog set (`plugin.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`), confirming `$schema` absent from root `plugin.json`.
3. `SKILL.md` YAML frontmatter fence (`---`) presence and required-key checks (`name === <dir>`, non-empty `description:`, `license: MIT`, `disable-model-invocation: true`), all 5 required skill folders, single-skill self-containment, `./references/` link target existence, cross-skill contract parity (`<untrusted_ticket_data>`, `STATE_DRIFT`, `CIRCUIT_OPEN`, provenance footer rules), and hardcoded planner-command denylist / forbidden-path / prescriptive-coding checks across every `.md` file inside each skill folder (strict YAML parsing and optional `SKILL.md` size linting are deferred to [#3](https://github.com/Kinasr/skills/issues/3)). Exact CLI flags, regexes, and test fixtures are specified in [Item 5](#5-scriptsvalidate-repomjs-create) and [Item 6](#6-scriptsvalidate-repotestmjs-create).

## Alternatives Considered

### Alternative A: Plugin-Root `references/trackers/*.md` Adapter Files (`github.md`, `jira.md`)

* **Pros:** Gives explicit per-tracker CLI examples in shared files.
* **Cons:** Breaks relative paths when skill directories are copied standalone outside the plugin root, adds maintenance per tracker, and constrains users to pre-authored tools.
* **Reason for Rejection:** Breaks standalone skill portability and locks teams to pre-authored adapters, whereas per-repo rules in `.agents/work-tracking.md` (plus passive rules in `./AGENTS.md`) and native CLIs/MCPs work across arbitrary trackers.

### Alternative B: Explicit `needs-triage` Workflow Label

* **Pros:** Makes untriaged tickets filterable with one positive label query across GitHub and GitLab.
* **Cons:** Human contributors file issues without workflow labels, requiring manual or bot backfill before `triage` picks them up.
* **Reason for Rejection:** Human-filed issues arrive unlabeled, so treating missing workflow states (or an explicit board intake column) plus active/terminal exclusions as untriaged avoids manual or bot label backfill at intake.

### Alternative C: Custom CLI Tools or Wrapper Scripts per Tracker

* **Pros:** Normalizes API calls, pagination flags, and state swaps behind one deterministic binary interface.
* **Cons:** Creates cross-platform maintenance across macOS, Windows, and Linux as tracker APIs and authentication models change.
* **Reason for Rejection:** Introduces high cross-platform and API maintenance cost; coding agents can drive installed tracker CLIs/MCPs directly or guide installation and auth.

### Alternative D: Sequential Single-Context Batch Triage on Harnesses Without Subagents

* **Pros:** Allows batch triage on every host regardless of subagent tool availability.
* **Cons:** Accumulates codebase reads across 2–10 tickets in one context window, raising token cost and degrading reasoning quality.
* **Reason for Rejection:** Multi-ticket code inspection in one shared context degrades reasoning quality; subagent-less hosts warn, print the top single-ticket command, and halt batch mode.

### Alternative E: Bundling Coding, TDD, Debugging, and PR-Formatting Skills

* **Pros:** Offers an end-to-end scripted pipeline from issue intake through pull request creation.
* **Cons:** Overrides host-native coding workflows, consumes prompt context, and duplicates built-in agent capabilities.
* **Reason for Rejection:** Scope is bounded to work orchestration around planners and coding agents plus session utilities.

### Alternative F: Full 7-Manifest Packaging (Codex CLI, Cursor, `omp`, `Muse`, `ChatGPT`) in v1 vs. Antigravity + Claude Code First

* **Pros:** Exposes marketplace catalogs across Codex, Cursor, and secondary hosts immediately on initial release.
* **Cons:** Ships four extra unverified manifests/catalogs and five `agents/openai.yaml` sidecars before any Codex or Cursor runtime testing occurs.
* **Reason for Rejection:** Scoping v1 manifests to Antigravity (`plugin.json`) and Claude Code (`.claude-plugin/`) covers the two target initial harnesses while keeping `skills/<name>/` clean for future Codex/Cursor/`npx skills add` expansion in [#2](https://github.com/Kinasr/skills/issues/2).

### Alternative G: Consolidating Into 1–2 Skills (`triage` + optional `handoff`) Scoped Only to `gh`/`glab`

* **Pros:** Minimizes skill surface area and avoids board-tracker status mapping edge cases.
* **Cons:** Loses dedicated `setup-flow` onboarding, standalone `backlog-audit` graph checks, explicit `to-tickets` slicing, and multi-tracker support.
* **Reason for Rejection:** Combining unrelated setup, global backlog graph auditing, and post-plan slicing into a single prompt bloats single skill prompts and excludes non-GitHub/GitLab users from core orchestration stages.

### Alternative H: Prefixed/Namespaced Skill Command Names (e.g., `wf-triage` or `ks-triage`)

* **Pros:** Avoids bare-name collisions in flat global skill registries and shared repo `.agents/skills/` folders.
* **Cons:** Lengthens interactive slash commands across both scoped plugin hosts (`/kinasr-skills:ks-triage`) and manual invocations.
* **Reason for Rejection:** Shorter bare commands (`setup-flow`, `triage`, `backlog-audit`, `to-tickets`, `handoff`) are preferred for daily interactive use, trading off manual cleanup of conflicting standalone local skills during onboarding (which `README.md` will document).

### Alternative I: Python-Based Offline Validation (`scripts/validate-repo.py` or `pytest` + `PyYAML`)

* **Pros:** Full YAML 1.2 parsing when paired with `PyYAML` and familiar Python test structure.
* **Cons:** Adds `pyproject.toml` / virtual-environment setup (`pytest`) or hits Windows Microsoft Store Python alias gaps on machines without Python installed.
* **Reason for Rejection:** Node.js 20+ stdlib avoids Windows Python Store-alias issues and external virtual-environment setup while reusing Node.js 20+, which is commonly available in JS/agent CLI environments and provisioned directly in CI via `setup-node`.

### Alternative J: Built-in Local Markdown File Tracker in v1

* **Pros:** Supports issue tracking in repositories without any external issue tracker CLI/MCP.
* **Cons:** Adds file frontmatter schemas, `001`–`999`/`1000+` padding rules, cross-branch next-ID scanning (`git ls-tree`), merge-safe duplicate-ID tie-breaking, and `AMBIGUOUS_DUPLICATE_REF` renumbering across all 5 skills before any v1 release.
* **Reason for Rejection:** Focusing v1 on `github`, `gitlab`, and `custom` external trackers removes local task-file collision machinery from v1; local Markdown task tracking is tracked separately in [#1](https://github.com/Kinasr/skills/issues/1).

### Alternative K: Storing Full Skill-Only Tracking Schema Inside Always-On `AGENTS.md`

* **Pros:** Keeps passive closing rules and all tracker settings in a single root Markdown file.
* **Cons:** Adds constant context cost for skill-only tracker IDs and scan settings on every general coding turn, leaks into isolated review contexts, imports bulky schema text via `@AGENTS.md` in Claude Code, and bloats root `AGENTS.md` on multi-field setups.
* **Reason for Rejection:** Keeping the standalone `./AGENTS.md` block minimal and placing skill-only configuration in on-demand `.agents/work-tracking.md` avoids constant context overhead on coding turns.

### Alternative L: Single Flat `SKILL.md` Without Subdirectories

* **Pros:** Guarantees every skill instruction resides in one file when read linearly.
* **Cons:** Forces dense batch-wave, audit-rule, slice-rule, and template schemas directly into top-level `SKILL.md` prompts.
* **Reason for Rejection:** Keeping top-level `SKILL.md` files concise and modular by placing templates and conditional sub-protocols under `skills/<name>/references/` retains readability and self-containment inside each `skills/<name>/` folder.

### Alternative M: Full YAML Dependency (`yaml`/`js-yaml`) or Custom Restricted YAML Parser in v1

* **Pros:** Validates arbitrary YAML syntax edge cases (pinned `yaml`) or rejects malformed nested YAML without `npm install` (custom parser).
* **Cons:** Adding `yaml` requires `package.json`, lockfiles, and `npm install` in every clone/CI run, while writing a custom restricted YAML parser adds maintenance before sidecars like `openai.yaml` even exist in v1.
* **Reason for Rejection:** Lightweight `---` frontmatter fence and required-key checks keep `validate-repo.mjs` zero-install and simple in v1, deferring strict YAML frontmatter validation and optional size linting to [#3](https://github.com/Kinasr/skills/issues/3).

### Alternative N: Skill-Local Helper Scripts (`skills/<name>/scripts/*.mjs`) for Deterministic Graph, YAML, and Redaction Logic

* **Pros:** Makes cycle detection, staleness arithmetic, heading slugification, and secret scrubbing deterministic without LLM calculation errors.
* **Cons:** Introduces cross-OS shell execution surface inside every skill package and requires read-only batch workers to invoke local binaries.
* **Reason for Rejection:** Pure-Markdown prompts paired with native agent file tools keep v1 skills shell-optional and compatible with restricted read-only workers, while documenting residual LLM computation risks in `Risks & Mitigations`.

## Non-Functional Requirements

* **Security & Privacy:** External issue titles, bodies, and comments (including public repositories) are framed in `<untrusted_ticket_data>` tags across single/batch `triage`, `backlog-audit`, and `to-tickets`. Triage workers use host read-only subagent profiles where exposed and prompt-level read-only constraints elsewhere (defense-in-depth, not hard host sandboxing), while single-mode `triage`, `backlog-audit`, and `to-tickets` run in the main agent mitigated by `<untrusted_ticket_data>` framing and `Propose -> Approve -> Apply`. Prose-extracted reference IDs pass syntactic allowlists (overridable via `ID Pattern`), and all CLI and MCP read, search, and write calls use option terminators (`--`), stdin, `--body-file`, or JSON API payloads with control-char/ANSI/unsafe-HTML sanitization in previews. `handoff` applies best-effort `[REDACTED]` scrubbing across API tokens/keys, passwords, private keys, auth headers, and `.env` snippets with mandatory user inspection and confirmation before posting a remote comment. The plugin stores zero API tokens or OAuth credentials.
* **Performance, Latency & Token Economics:** Always-on standalone `./AGENTS.md` (`## Work Tracking`) stays at a 4-line passive block while skill configuration loads strictly on demand from `.agents/work-tracking.md` (with `gh`/`glab` remote fallback). `backlog-audit` uses bounded field-projected pagination with reference closure plus bounded PR queries, while `to-tickets` runs bounded Pass-1 metadata scans plus targeted keyword searches, both disclosing scan counts and truncation. Batch `triage` runs one bounded Coordinator fetch and dispatches workers in waves. Each `SKILL.md` stays concise as an authoring practice by placing dense templates and conditional protocols inside skill-local `references/*.md`.
* **Cross-Platform Portability, Upgrades & Recovery:** Strictly zero git symlinks outside `.git`. Mutating skills enforce `Propose -> Approve -> Apply`, pre-apply state re-verification skipping drifted items, fail-safe mutation ordering (`add-new -> remove-old`, `comment -> close`), batch `Apply` circuit breaking on systemic auth/rate-limit failures, branch-free provenance footers with plain-text fallback for non-HTML trackers, partial-failure resume receipts, and `README.md` upgrade notes instructing users to delete prior plugin directories before manual reinstalls.

## Risks & Mitigations

* **Prompt-Only Read-Only Boundaries & Main-Agent Untrusted Reads:** Hosts without native read-only subagent profiles expose write/shell tools to batch workers, and single-mode `triage`, `backlog-audit`, and `to-tickets` run inside the main agent. *Mitigation:* Document defense-in-depth boundaries explicitly, isolate external text with `<untrusted_ticket_data>`, sanitize preview strings, validate extracted IDs via allowlists/custom `ID Pattern`, pass `--`/stdin/JSON on all CLI/MCP reads and writes, use built-in read-only subagent profiles where available, and gate all mutations on `Propose -> Approve -> Apply`.
* **Non-Transactional Tracker Writes & TOCTOU Drift:** External CLIs/MCPs cannot roll back multi-ticket batches if step `k` fails or a ticket changed since preview. *Mitigation:* Enforce fail-safe ordering (`add-new -> remove-old`, `comment -> close`), re-verify ticket state immediately before `Apply` (marking drifted items `SKIPPED (STATE_DRIFT)` and cascading `NEEDS_RECHECK` to dependent wave items), short-circuit remaining writes on `401`/`403`/`429` (`CIRCUIT_OPEN`), write prose `Blocked by` at creation on `native_deps=true`, and emit receipts with resume support.
* **Bounded Backlog Truncation & Ref-Cap Overflow:** Large trackers hide either recent active work (when ordered oldest-first) or older Frontier/stale items past `Max Backlog Scan`, can truncate newly opened epic children, and can exhaust Pass 1.5 reference closure before Pass-1 truncation. *Mitigation:* Partition Pass-1 queries across priority/stale/general slices where supported (or disclose newest-work truncation), run cross-status (still ref-capped) Pass 1.5 lookups including PR-linked IDs and flagging overflow as `UNVERIFIED (REF_CAP_REACHED)`, suppress unverified dangling-ID errors and verify/suppress candidate closeable epics under truncation, project dependency lines before snippet truncation, and pair `to-tickets` Pass 1 with targeted keyword queries.
* **Pure-LLM Deterministic Computation & Schema Drift:** Without skill-local helper scripts (`Alternative N`), cycle detection, date arithmetic, slugification, and heading anchor normalization rely on prompt adherence. *Mitigation:* Keep schemas small and explicit inside `references/*.md`, require preview inspection before writes, and validate cross-skill contract markers in `validate-repo.mjs`.
* **LLM Secret-Redaction False Negatives in `handoff`:** Pattern prompts can miss proprietary token formats before posting to remote issue comments. *Mitigation:* Keep remote comments behind a separate approval preview gate (skipping remote writes altogether when printing local stdout snapshots), scrub enumerated secret classes to `[REDACTED]` as best-effort hygiene, and warn users to inspect previews before posting remotely.
* **Bare-Name Skill Collisions in Flat Registries:** Hosts or local skill folders holding an existing bare `triage` skill can shadow plugin commands. *Mitigation:* Document backing up or removing conflicting standalone local skills (such as `~/.gemini/config/skills/triage/` or `~/.claude/skills/triage/`) in `README.md`.
* **Primary Post-Release Runtime Gap (Claude Code):** None of the manifests, skills, or CI workflows exist yet; once built, pre-release automated CI is planned to check JSON syntax and cross-manifest metadata parity across all 3 manifest/catalog files, while pre-release runtime execution is planned for Antigravity CLI/App only—deferring Claude Code runtime smoke checks post-release. *Mitigation:* Disclose planned vs. executed verification tiers accurately in `README.md` and [Verification Plan](#verification-plan).

## Open Questions

None. (CI runtime, standalone `./AGENTS.md` + on-demand `.agents/work-tracking.md` configuration, deferred GitHub issues, and backlog scan bounds are resolved in [Technical Plan](#technical-plan-architecture) and [Future Improvements](#future-improvements).)

## Additional Resources

* Target repository: [Kinasr/skills](https://github.com/Kinasr/skills) (MIT License)
* Planner ecosystem reference: [Elephant-Goldfish Model (EGM)](https://github.com/google/elephant-goldfish-model)
* Multi-harness plugin specification reference: [EGM Harnesses Guide](https://github.com/google/elephant-goldfish-model/blob/main/docs/harnesses.md)

## Future Improvements

* **Local Markdown File Tracker ([#1](https://github.com/Kinasr/skills/issues/1)):** Add optional local Markdown file tracking (`T-NNN` frontmatter, all-status + git-ref next-ID scan, duplicate-ID tie-breaking, and local updates).
* **Additional Harness Packaging ([#2](https://github.com/Kinasr/skills/issues/2)):** Add Codex CLI, Cursor, and generic `npx skills add` manifests, `openai.yaml` sidecars, fresh-turn isolation flags, and post-release multi-harness runtime verification.
* **Strict YAML & Skill Size Linting ([#3](https://github.com/Kinasr/skills/issues/3)):** Add full or strict-subset YAML frontmatter parsing and optional `SKILL.md` line/size budgeting to `scripts/validate-repo.mjs`.
* **Automated Scenario Fixtures:** Add optional `test_scenarios.yaml` behavioral prompts for end-to-end skill regression checks across harnesses.
* **First-Class EGM Lite Binding:** Add verified default `.agents/work-tracking.md` configuration examples for `/egm-lite`.
* **Optional Bundle Splitting:** Split unrelated future personal utilities into a separate plugin manifest if their scope diverges from work orchestration.

---

## Detailed Implementation Plan

The implementation is partitioned into four incremental phases; each phase ends with a validation checkpoint.

### Phase 1: Repository Packaging, License, Manifests & Validator

*Checkpoint:* `node scripts/validate-repo.mjs --allow-missing-skills && node --test scripts/validate-repo.test.mjs` exits `0` after completing Items 1–6.

#### 1. `LICENSE` (Create)
* Create standard MIT License text (`Copyright (c) 2026 kinasr`).

#### 2. `plugin.json` (Create)
* Declare canonical Antigravity root manifest (omitting `$schema` to prevent strict root-schema validation conflicts and omitting `"skills"`, which defaults to `./skills/`):
  * `name`: `"kinasr-skills"`, `displayName`: `"Kinasr Skills"`, `version`: `"0.1.0"`, `license`: `"MIT"`, `author`: `{"name": "kinasr"}`
  * `description`: `"Work-orchestration and session-hygiene skills around AI coding agents and planners."`
  * `homepage`: `"https://github.com/Kinasr/skills"`, `repository`: `"https://github.com/Kinasr/skills"`
  * `suggestedPrompts`: `["Initialize work tracking for this repository", "Triage untriaged issues and propose readiness states", "Audit the open backlog for blockers and stale items"]`

#### 3. `.claude-plugin/plugin.json` (Create)
* Mirror root `name`, `displayName`, `version`, `description`, `author`, `homepage`, `repository`, and `license`.
* Add `keywords`: `["work-tracking", "triage", "backlog", "agent-skills"]`, `documentationUrl`: `"https://github.com/Kinasr/skills#readme"`, `supportUrl`: `"https://github.com/Kinasr/skills/issues"`.
* Omit `"agents"` because zero custom agent persona files are shipped in this plugin (preserving `skills/<name>/` portability).

#### 4. `.claude-plugin/marketplace.json` (Create)
* Declare `name`: `"kinasr-skills"`, `owner`: `{"name": "kinasr"}`, and `plugins`: `[{"name": "kinasr-skills", "source": "./", "description": "Work-orchestration and session-hygiene skills around AI coding agents and planners."}]`.

#### 5. `scripts/validate-repo.mjs` (Create)
* **Runtime, Exports & CLI:** Zero-dependency Node.js 20+ ESM (`node:fs`, `node:path`, `node:url`, `node:child_process`). Resolve repo root via `fileURLToPath(import.meta.url)` or `--root <dir>`. Export `validateRepo(rootDir, { allowMissingSkills, runGitLsFiles } = {})` and `validateSkillDir(skillDir)` alongside CLI flags `--allow-missing-skills` (Phase 1–2 bootstrap only; default strict) and `--skill-dir <dir>` (single-skill self-containment validation).
* **Symlinks & Static Files:** Recursively fail on `lstatSync().isSymbolicLink()` outside `.git`. If `runGitLsFiles` is injected or `.git` exists (directory or gitfile worktree), execute `runGitLsFiles(rootDir)` (`git ls-files -s` returning stdout or `null` on `ENOENT`) rejecting mode `120000` (catches Windows `core.symlinks=false`), skipping git-index checks without failing when `.git` is absent or `git` is missing from `PATH`, and failing on non-`ENOENT` git execution errors. Assert `LICENSE` and `README.md` exist with `content.trim().length > 0`.
* **Manifest & Catalog Metadata Parity (Explicit 3-File List):**
  * Plugin manifests (`plugin.json`, `.claude-plugin/plugin.json`): assert non-empty strings and equal `name === "kinasr-skills"`, `displayName === "Kinasr Skills"`, `version`, `description`, `author.name`, `homepage`, `repository`, and `license === "MIT"`; assert required `.claude-plugin/plugin.json` fields (`keywords` non-empty array, `documentationUrl`, `supportUrl`); assert `$schema` absent from root `plugin.json`.
  * Marketplace catalog (`.claude-plugin/marketplace.json`): assert `name === "kinasr-skills"`, non-empty `owner.name === author.name`, `plugins[0].name === "kinasr-skills"`, `plugins[0].source === "./"`, and `plugins[0].description === root.description`.
* **Frontmatter Key, Self-Containment & Boundary Checks:**
  * Unless `allowMissingSkills` is set, fail if `skills/` is empty/missing or any of the 5 required directories (`setup-flow`, `triage`, `backlog-audit`, `to-tickets`, `handoff`) is missing or empty; when `allowMissingSkills` is true, tolerate an absent `skills/` folder (Phase 1) while validating any present directories under `skills/` (Phase 2 or user-added skills).
  * Assert every present `skills/<dir>/SKILL.md` starts and closes with `---` frontmatter fences and extracts top-level required fields (`name === <dir>`, non-empty `description`, `license === "MIT"`, `disable-model-invocation === "true"`), without enforcing strict YAML syntax parsing or a hard line-count cap. Assert every `./references/<file>.md` path referenced in `SKILL.md` exists inside `skills/<dir>/`.
  * Boundary & parity assertions across **every `.md` file inside `skills/<dir>/`** (`SKILL.md` and `references/*.md`): fail on hardcoded planner commands (`/egm:egm-`, `/egm-brainstorm`, `/egm-draft`, `/egm-review`, `/egm-lite`, `/egm-resolve`, `/egm-bootstrap`, `/egm-drift-report`, `/egm-review-loop`, `/skill:egm-`); fail on forbidden plugin-external/root relative paths matching `/(?:^|[\s(`"'])(?:\.\.\/|\.\/scripts\/|(?:references|scripts)\/)/` (`./references/` inside a skill folder and target-repo `AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md`, `.agents/work-tracking.md`, `docs/` are unaffected by the regex); fail on prescriptive coding/TDD directives matching `/\b(write (failing )?unit tests? first|red-green-refactor|run tdd|enforce commit style|format pull request body)\b/i`; and verify cross-skill contract parity (`<untrusted_ticket_data>` across `triage`, `backlog-audit`, `to-tickets`; `STATE_DRIFT` and `CIRCUIT_OPEN` across `triage` and `backlog-audit`; and remote provenance footer rules across `triage`, `backlog-audit`, and `handoff`).

#### 6. `scripts/validate-repo.test.mjs` (Create)
* Built-in `node:test` + `node:assert/strict` suite cloning fixtures into `fs.mkdtempSync` temp directories:
  * **Positive assertions (no throw / exit `0`):** Full valid repository fixture passes strict `validateRepo`; isolated single-skill directory copy passes `validateSkillDir` / `--skill-dir` independently; Phase 1 absent `skills/` and Phase 2 partial `skills/` pass `--allow-missing-skills`; multi-line `description` or quoted scalars inside `SKILL.md` frontmatter pass regardless of physical line count.
  * **Negative failure assertions (reject / non-zero exit):** Symlink file outside `.git`, mocked `runGitLsFiles` returning mode `120000`, missing-`git` `ENOENT` skip guard vs. non-`ENOENT` failure, malformed JSON, `plugin.json`/`.claude-plugin/plugin.json`/`.claude-plugin/marketplace.json` `name`/`version`/`description`/`plugins[0].source`/`plugins[0].description`/`owner.name`/`keywords` drift, `$schema` in root `plugin.json`, `displayName` drift, missing/empty skill directory (strict mode vs. `--allow-missing-skills`), missing/whitespace-only `LICENSE` or `README.md`, missing `---` frontmatter fences, `name !== <dir>`, `license !== "MIT"`, missing/empty `SKILL.md` `description`, missing/`false` `disable-model-invocation`, broken `./references/` link, each denylisted planner command in `SKILL.md` and `references/*.md`, `../` / `./scripts/` / bare `references/` or `scripts/` in `SKILL.md` and `references/*.md`, missing cross-skill contract marker, and prescriptive TDD/coding regex match.

### Phase 2: Onboarding & Session Handoff Skills

*Checkpoint:* `node scripts/validate-repo.mjs --allow-missing-skills && node scripts/validate-repo.mjs --skill-dir skills/setup-flow && node scripts/validate-repo.mjs --skill-dir skills/handoff` exits `0`.

#### 7. `skills/setup-flow/SKILL.md` & `skills/setup-flow/references/templates.md` (Create)
* **Frontmatter:** `name: setup-flow`, `license: MIT`, `disable-model-invocation: true`, `description: "Initialize or update work-tracking config in .agents/work-tracking.md and passive rules in AGENTS.md."`
* **Preflight & Probe:**
  * Emit Run Context Header (`Config: none (initializing)` if both `.agents/work-tracking.md` and remote inference are absent; `Config: inferred (<remote>)` if remote is inferred; `Config: .agents/work-tracking.md` if configured).
  * Read `.agents/work-tracking.md` and `./AGENTS.md` directly; inspect existing root `CLAUDE.md`, `.claude/CLAUDE.md`, and user-indicated or existing legacy tracking files under `.github/` or `docs/agents/` (prefilling defaults and proposing archive to `.agents/archive/` or removal on approval); probe tracker CLI/MCP tools, auth status, capabilities, and `native_deps`.
* **Workflow & `./references/templates.md` Schema:**
  * Collect tracker defaults (`Tracker`: `github`, `gitlab`, or `custom`; `Tooling: tool=<cli_or_mcp>; target=<repo_or_board_id>; native_deps=true|false`), `Untriaged Signal` (`missing workflow label` or board column), `Workflow States` (`needs-info, ready:direct, ready:lite, ready:design`), `Excluded Active/Terminal States` (`in-progress, in-review, done, closed`), `Ticket Types` (`bug, feature, enhancement, chore, docs, epic`), `Priority Labels` (`none` default), `Passive WIP Signal` (`open linked PRs`), `Lite Planner` / `Full Planner` free-text user-facing hints (omitting denylisted `/egm-*` commands), `Specs Path` (`docs/designs/`), `Linking Rule` (`Blocked by <ID>`, `Parent: <ID>`, `Related to <ID>`, `Supersedes <ID>` when `native_deps=false`), optional `ID Pattern`, `Max Backlog Scan` (`150`), and `Stale Days` (`30`).
  * Define exact `.agents/work-tracking.md` Markdown layout (`# Work Tracking Config`, `Schema: 1`, `- **Key:** value`) and standalone 4-line `./AGENTS.md` template inside `./references/templates.md`. Merge custom notes idempotently; disclose unsupported operations on custom CLIs/MCPs and guide missing CLI/auth setup.
* **Safety & Outputs:** Preview `.agents/work-tracking.md`, standalone 4-line passive `./AGENTS.md` block, opt-in top `@AGENTS.md` (`./CLAUDE.md`) or `@../AGENTS.md` (`.claude/CLAUDE.md`) pointer **only when that file already exists and the user explicitly opts in** (never creating `CLAUDE.md`), legacy cleanup, and workflow label initialization under `Propose -> Approve -> Apply`, then print Execution Receipt.

#### 8. `skills/handoff/SKILL.md` (Create)
* **Frontmatter:** `name: handoff`, `license: MIT`, `disable-model-invocation: true`, `description: "Generate a git-grounded session handoff snapshot and optionally post a redacted update to the active ticket."`
* **Inputs & Preflight:** Read `.agents/work-tracking.md` if present, or check `git remote -v` + `gh`/`glab` (exempt from unconfigured halt; fall back to `Config: none (local-only)`). Inspect `git status`, `git diff --stat`, `HEAD` SHA (`Branch: detached@<short-sha>`, `<unborn-HEAD>`, or `<no-git>` fallbacks), and ISO-8601 UTC timestamp (`YYYY-MM-DDTHH:MM:SSZ`), and emit Run Context Header upfront.
* **Workflow:** Compute 4-state verification freshness across commands run in-session using strict precedence (`FAILED_ON_CURRENT_DIFF` > `STALE_PRE_EDIT` [annotating `last run failed` if a prior check failed] > `VERIFIED_ON_CURRENT_DIFF` > `UNVERIFIED`) and print the plain-text Markdown snapshot directly to chat first (`## Context`, `## Git State`, `## Decisions & Progress`, `## Verification Freshness`, `## Open Risks / Next Steps`) without batch-receipt or footer ceremony.
* **Optional Remote Post:** Only when `.agents/work-tracking.md` or an inferred remote resolves an active ticket (`explicit arg > branch key [#N or configured tracker prefix, ignoring date branches] > session context`), apply best-effort `[REDACTED]` scrubbing across API keys/tokens, passwords, private keys, auth headers, and `.env` values, and present a separate approval preview before posting a remote comment via `--body-file`, stdin, or JSON payloads (with branch-free provenance footer `<!-- kinasr-skills: <skill> | <UTC-timestamp> | <short-sha|no-sha> -->`, or plain-text `[kinasr-skills: ...]` on non-HTML trackers, followed by Execution Receipt only if posted).

### Phase 3: Triage, Backlog Audit, Vertical Slicing & CI Workflow

*Checkpoint:* `.github/workflows/validate.yml` exists and strict unflagged `node scripts/validate-repo.mjs && node --test scripts/validate-repo.test.mjs` exits `0` across all 5 skills and manifests.

#### 9. `skills/triage/SKILL.md` & `skills/triage/references/batch-wave.md` (Create)
* **Frontmatter:** `name: triage`, `license: MIT`, `disable-model-invocation: true`, `description: "Triage single tickets or small batches in topological waves to assign readiness, types, and blockers."`
* **Inputs & Preflight:** Emit Run Context Header; read `.agents/work-tracking.md` (or `gh`/`glab` via `git remote -v` with multi-remote disambiguation, halting and instructing the user to run `setup-flow` via harness-neutral wording if neither resolves); verify CLI/MCP auth and probe target-repo labels; frame all ticket text `<untrusted_ticket_data>`; enforce syntactic reference-ID allowlists (strip leading `#` before `^\d+$` while rejecting `owner/repo#N`, allow `^[A-Z][A-Z0-9]+-\d+$` and custom `ID Pattern`) plus `--`/stdin/`--body-file`/JSON passing on all CLI/MCP reads and writes and sanitize control/ANSI/unsafe-HTML sequences in previews.
* **Readiness Classification Rubric & Single Mode:** Classify into `needs-info`, `ready:direct` (paired with 3-line plan: target files/symbols, core change, verification check), `ready:lite` (printing `Lite Planner` hint verbatim), or `ready:design` (printing `Full Planner` hint verbatim). Single mode proposes normalization on `STATE_CONFLICT` labels, probes `Passive WIP Signal` (`open linked PRs`), warns and requests confirmation before re-triaging `epic` (`Ticket Types`), excluded active/terminal states (`in-progress`, `in-review`, `done`, `closed`), or active-PR items, resolves `needs-info` threads or inspects source paths and blockers, persists `Blocked by` edges and the 3-line plan per tracker mode (`native_deps=true` native blocking API + comment; `native_deps=false` top-of-body append/diff + comment), re-verifies state (`SKIPPED (STATE_DRIFT)` on drift), applies via `--body-file`/stdin/JSON + combined swap (else `add-new -> remove-old`), emits Execution Receipt + branch-free provenance footer, and stops without editing source code.
* **Batch Mode (`<=10` tickets; wave schema in `./references/batch-wave.md`):**
  * Probe subagent tool exposure first: if unavailable, use explicit IDs or 1 metadata-only list fetch (no code reads) to name the top-priority single-ticket `triage` command (`bug` first, oldest `created_at` ascending), warn on context consumption, and halt.
  * When `>10` untriaged match (excluding `needs-info` and active PR WIP unless explicitly requested), prioritize existing `bug` items first then oldest `created_at`, reporting remaining count; if any selected item references an untriaged blocker outside the 10-ticket cap, flag it `BLOCKED_BY_UNTRIAGED (<ID>)` and still dispatch it in Wave 1 with an explicit warning note.
  * Coordinator fetches batch + blocker metadata once (`4 KB` raw body/comment cap). If explicit IDs carry `STATE_CONFLICT`, normalize in Dry-Run; skip `epic`/excluded-state/PR-WIP items unless confirmed in Preflight. Compute SCCs along `Blocked by` edges only (`Parent:` adds no wave ordering): tag cyclic nodes `CYCLE_BLOCKED` (routed to `backlog-audit`), tag acyclic nodes blocked by cycles or runtime-failed `UNRESOLVED` workers `UPSTREAM_UNRESOLVED` (routed to `triage` retry alongside `UNRESOLVED`), excluding all three from downstream dispatch and `Apply`.
  * Dispatch read-only workers with concurrency `min(4, host_limit)` (default `host_limit = 4`, falling back to 1-at-a-time isolated subagent waves on spawn/rate-limit errors), selecting the active host's built-in read-only profile (`research` in Antigravity, `Explore` in Claude Code, or general-purpose subagent + prompt-only read-only constraints elsewhere). Workers return envelope JSON (`ticket_id, execution_status: OK|TIMEOUT|ERROR, inspected_paths, recommended_state, type, blockers, plan_lines, questions, rationale, error_detail` with nullable fields and non-JSON output mapped to `ERROR`/`UNRESOLVED`).
  * Forward compact `Wave k` summaries (`ticket_id, recommended_state, type, blockers, plan_lines`) to dependent `Wave k+1` workers; when a `Wave k` blocker resolves to `needs-info` or `ready:design`, attach an upstream-blocker warning note to `Wave k+1` items without capping their independent Triage Readiness.
  * Cascade `NEEDS_RECHECK` to transitive dependents when interactive `Approve` overrides alter upstream `recommended_state`/`blockers` or when `Apply`-time `STATE_DRIFT` hits an upstream item. Skip `CYCLE_BLOCKED`/`UNRESOLVED`/`UPSTREAM_UNRESOLVED`/`NEEDS_RECHECK`/`STATE_DRIFT` on `Apply` (`SKIPPED (CIRCUIT_OPEN)` on systemic `401`/`403`/`429`), emit Execution Receipt, and stop without editing source code.

#### 10. `skills/backlog-audit/SKILL.md` & `skills/backlog-audit/references/audit-rules.md` (Create)
* **Frontmatter:** `name: backlog-audit`, `license: MIT`, `disable-model-invocation: true`, `description: "Audit the open backlog dependency graph, PR links, conflicts, and stale items without deep code reads."`
* **Inputs & Preflight:** Emit Run Context Header, load `.agents/work-tracking.md` (or `gh`/`glab` remote fallback), and probe CLI/MCP auth; wrap ticket text in `<untrusted_ticket_data>`; enforce syntactic ID allowlists (stripping leading `#`, rejecting `owner/repo#N`, honoring custom `ID Pattern`) plus `--`/stdin/`--body-file`/JSON passing on all queries/writes and preview control/ANSI/unsafe-HTML sanitization.
* **Bounded Fetch & Output Details (exact predicates in `./references/audit-rules.md`):**
  * Pass 1 fetches up to `Max Backlog Scan` (`150` default) minimal projected fields (`id, title, state, labels/type, created_at, updated_at` + native links if `native_deps=true`, or CLI/API-side full-body extraction of `Blocked by`/`Parent:`/`Supersedes` + `<=512`-char snippet if `native_deps=false`); partition Pass 1 across priority/stale/general slices where query filters exist, or use `updated_at` ascending disclosing newest-work truncation.
  * Run a bounded open PR fetch (`<= Max Backlog Scan`, noting if PR inspection is unavailable). Cross-status Pass 1.5 fetches up to `30` missing referenced `Blocked by`/`Parent:`/`Supersedes` IDs plus open-PR-linked IDs (tagging overflow past `30` as `UNVERIFIED (REF_CAP_REACHED)`). Pass 2 fetches `2 KB` body excerpts for up to `30` prioritized candidates (`STATE_CONFLICT`, unclear dependency context, prose conflict candidates). Disclose `Scanned N of M open tickets` / `Scanned N+ open tickets; total unavailable` / `TRUNCATED / PARTIAL GRAPH` (suppressing unverified dangling-ID errors, verifying candidate closeable epics via child lookup or marking `UNVERIFIED (TRUNCATED_GRAPH)`, and prompting `label`/`milestone`/`assignee` filters).
  * Detect cycles, closed blockers, verified dangling IDs, native-vs-prose drift, open `epic` items (`>= 1` child) with all children closed, open tickets targeted by `Supersedes <ID>`, `STATE_CONFLICT` (multiple readiness labels), and stale items past `Stale Days` (including stalled `in-progress`/`in-review`; exempting epics with open non-stale children; routing code staleness to `triage`).
  * Define prose grammar outside fenced code blocks (`Blocked by:?`, `Parent:?`, `Supersedes:?`, matching native+prose links cleanly), separate `CONFIRMED` (`closingIssuesReferences`/`Closes #N`, structured links) vs. `SUSPECTED` (branch/title match, prose overlap), place items in Quantitative Health Summary + **Actionable Frontier** (`ready:direct`, not in `Excluded Active/Terminal States`, unblocked, no PR, non-`epic`), **Active WIP (Open PR / In-Progress)**, and **Blocked Queue** (with `WIP` badge if an item has both an open PR and a blocker). Propose concrete fixes (`STATE_CONFLICT` normalization, `link sync` user-selected winner, `closed blockers` remove ref, `stale` ping/re-triage, `open superseded` close with rationale), and execute approved fixes via `comment -> close` / `add-new -> remove-old`, `SKIPPED (STATE_DRIFT)`, `SKIPPED (CIRCUIT_OPEN)`, branch-free provenance footer, and Execution Receipt.

#### 11. `skills/to-tickets/SKILL.md` & `skills/to-tickets/references/slice-rules.md` (Create)
* **Frontmatter:** `name: to-tickets`, `license: MIT`, `disable-model-invocation: true`, `description: "Slice a finished design spec or inline plan into vertical ready:direct tickets in topological order."`
* **Inputs & Preflight:** Emit Run Context Header + `.agents/work-tracking.md` (or `gh`/`glab` remote fallback) + CLI/MCP auth & label probe; frame external text in `<untrusted_ticket_data>`, enforce syntactic ID allowlists + custom `ID Pattern` + `--`/stdin/`--body-file`/JSON passing on all queries/writes, and sanitize control/ANSI/unsafe-HTML previews. Accept committed spec path (`Spec: <path>#<anchor>`, or unanchored `<path>` for whole-file slicing; GitHub anchor normalization: lowercase, strip non-alphanumeric except spaces/hyphens, spaces->`-`, preserve `--`, `-1`/`-2` duplicate suffixes; confirm if untracked/dirty), inline Lite plan (omitting `spec`), or `--resume [path|receipt]`.
* **Workflow (Zero Mutation of Existing Tickets; details in `./references/slice-rules.md`):** Scan open tickets up to `Max Backlog Scan` (`150` default, disclosing `Scanned N of M` / `total unavailable` / `TRUNCATED`) plus 1 targeted keyword overlap search per proposed slice. Propose PR-sized vertical slices (`ready:direct`, sections `## Summary`, `## Acceptance Criteria`, `## Links`; minting 1 parent `epic` with no `ready:*` intake label when `>=3` spec slices share a spec and no parent ID is supplied, or optionally on `>=3` inline slices upon confirmation); when slicing from a planned origin ticket, pass `Parent: <origin-ID>` only if already an `epic`, otherwise attach `Supersedes <origin-ID>` on the minted `epic` (or on each slice) and recommend follow-up `backlog-audit` cleanup. Handle overlaps via `link` (`Related to <ID>`), `skip` (rebinding dependents to the existing ID), or `supersede` (`Supersedes <ID>` + `backlog-audit` close recommendation).
* **Safety & Outputs:** Under `Propose -> Approve -> Apply`, run pre-creation duplicate checks (on collision, skip create, bind existing ID into `created_ids` & dependent edges, and log `SKIPPED (DUPLICATE_EXISTS)`), create parents/unblocked slices first, write prose `Blocked by` at creation even on `native_deps=true` before binding native edges via `--body-file`/stdin/JSON, apply `SKIPPED (CIRCUIT_OPEN)` on systemic write errors, and emit a fenced JSON Execution Receipt (`created_ids`, `pending_slices`, `pending_edges`) consumed via chat or `--resume <path>`.

#### 12. `.github/workflows/validate.yml` (Create)
* Trigger `on: [push, pull_request]`; `permissions: { contents: read }`; `strategy: { fail-fast: false, matrix: { os: [ubuntu-latest, macos-latest, windows-latest] } }`; `actions/checkout@v4` + `actions/setup-node@v4` (`node-version: 20`); run unflagged `node scripts/validate-repo.mjs` and `node --test scripts/validate-repo.test.mjs`.

### Phase 4: Public Documentation & Full Verification

*Checkpoint:* Local validator/test scripts and GitHub Actions 3-OS CI matrix (`ubuntu-latest`, `macos-latest`, `windows-latest`) exit `0`, and pre-release Antigravity CLI/App behavioral smoke checks pass.

#### 13. `README.md` (Modify)
* Replace placeholder `# skills` with public documentation covering:
  * **Scope Boundary:** Work-orchestration and session hygiene around AI coding agents and planners without controlling code implementation.
  * **5-Skill Lifecycle & Planners:** Overview of `setup-flow`, `triage`, `backlog-audit`, `to-tickets`, `handoff`, pairing with EGM and swapping `Lite Planner` / `Full Planner` in `.agents/work-tracking.md`.
  * **Per-Harness Support, Installation, Upgrades & Invocation:**
    * *Planned pre-release runtime targets:* Antigravity CLI (`agy plugin install https://github.com/Kinasr/skills`, invoke `/kinasr-skills:<skill>`), manual Antigravity App install (`~/.gemini/config/plugins/kinasr-skills/` or `%USERPROFILE%\.gemini\config\plugins\kinasr-skills\`, copying `plugin.json`, `README.md`, `LICENSE`, `skills/`; note Standalone Antigravity IDE lacks `invoke_subagent`, and interactive command forms in both Antigravity App and Antigravity for IDEs remain unverified until tested).
    * *Planned CI-validated pre-release & post-release manual runtime target:* Claude Code (`claude plugin marketplace add Kinasr/skills && claude plugin install kinasr-skills@kinasr-skills`, invoke `/kinasr-skills:<skill>`).
    * *Deferred Harnesses:* Point to [#2](https://github.com/Kinasr/skills/issues/2) for Codex, Cursor, and generic `skills/` installers.
    * *Manual Upgrades & Standalone Conflicts:* For manual directory installs, delete the existing plugin directory before copying the updated version so obsolete files do not remain; back up or remove conflicting pre-existing standalone local skills (such as `~/.gemini/config/skills/triage/` or `~/.claude/skills/triage/`).
  * Example standalone 4-line passive `./AGENTS.md` `## Work Tracking` block + on-demand `.agents/work-tracking.md` (`Schema: 1`, including `Priority Labels`) config, opt-in `CLAUDE.md` (`@AGENTS.md`) / `.claude/CLAUDE.md` (`@../AGENTS.md`) note when those files exist, zero-config `gh`/`glab` fallback via `git remote -v`, local validation command `node scripts/validate-repo.mjs && node --test scripts/validate-repo.test.mjs`, and MIT License notice.

---

## Verification Plan

* **Static & Cross-Platform CI Validation:** Run `node scripts/validate-repo.mjs` and `node --test scripts/validate-repo.test.mjs` locally and verify exit code `0` across `ubuntu-latest`, `macos-latest`, and `windows-latest` in `.github/workflows/validate.yml` (Node.js 20+), confirming zero symlinks (including `git ls-files -s` mode `120000`), JSON syntax and cross-manifest metadata/required-field parity (`plugin.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`), `SKILL.md` frontmatter fences and required keys, 5-skill presence, `./references/` target existence, cross-skill contract parity, and boundary rules across `SKILL.md` and `references/*.md`.
* **Automated Positive, Negative & Isolation Validator Suite (`scripts/validate-repo.test.mjs`):** Verify `no throw` / `exit 0` on a complete valid repository fixture, isolated copies of each of the 5 `skills/<name>/` directories via `validateSkillDir` / `--skill-dir`, and `--allow-missing-skills` Phase 1–2 fixtures, and verify `reject` / non-zero exit on every negative failure class enumerated in Items 5–6.
* **Pre-Release Antigravity Discovery & Behavioral Smoke Checks:** In a clean test environment (backing up/disabling any pre-existing external local `triage` skill only with user confirmation), verify Antigravity CLI/App plugin load with zero parse errors and all 5 commands exposed. Run separate dry-run preview assertions and approved `Apply` write assertions on a GitHub Issues repo covering:
  * Standalone 4-line `./AGENTS.md` + `.agents/work-tracking.md` and opt-in existing-`CLAUDE.md` (`@AGENTS.md`) / `.claude/CLAUDE.md` (`@../AGENTS.md`) file generation.
  * Zero-config `gh`/`glab` `git remote -v` fallback (with exclusions, label probe, and multi-remote disambiguation).
  * `triage` `>10` `bug`-first cap, readiness rubric routing (`needs-info`, `ready:direct`, `ready:lite`, `ready:design`), `BLOCKED_BY_UNTRIAGED`, `CYCLE_BLOCKED`, `UPSTREAM_UNRESOLVED` -> `triage` retry, Standalone IDE / simulated subagent-less halt, `UNRESOLVED` / `NEEDS_RECHECK` / `STATE_DRIFT` / `CIRCUIT_OPEN` skips.
  * `backlog-audit` `UNVERIFIED (REF_CAP_REACHED)`, `TRUNCATED` filter prompt, `Active WIP (Open PR / In-Progress)` split, and `Supersedes` close proposals.
  * `to-tickets` non-mutating `supersede` + planned origin `epic` vs. `Supersedes` + `DUPLICATE_EXISTS` + `--resume` fenced JSON receipt, and `handoff` local snapshot (no receipt/footer ceremony) plus `[REDACTED]` scrub preview + `FAILED_ON_CURRENT_DIFF` / `STALE_PRE_EDIT` on remote comment post.
* **Post-Release Manual Runtime Check (Claude Code):** After release, manually execute discovery plus one dry-run preview and one approved `Apply` check on Claude Code (plus Antigravity App/IDE interactive command forms) and record results in `README.md`.

---

*Drafted with EGM*
