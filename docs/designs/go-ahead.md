# go-ahead: Parallel Execution Orchestrator Skill

*   **Author:** kinasr
*   **Status:** Implemented (v0.2.0; runtime smoke checks pending)
*   **Date:** 2026-11-27

--------------------------------------------------------------------------------

## Overview

`go-ahead` is the 6th user-invoked skill (`skills/go-ahead/SKILL.md`, backed by skill-local `./references/` sub-protocols) in the `kinasr-skills` plugin. It completes the backlog-to-PR workflow after `triage`, `backlog-audit`, and `to-tickets` by orchestrating parallel implementation of `ready:direct` tickets across isolated git worktrees in dependency- and overlap-ordered waves, delivering a single combined pull request to the repository's default branch using `./AGENTS.md` `Closing Rule`, and running one fresh-context read-only Adversarial PR Review pass (checking for missed acceptance criteria, cross-ticket regressions, edge cases, and unnecessary modifications) before push or PR creation.

The skill brings portable, tracker-aware multi-agent execution to Claude Code, Antigravity, and other subagent-capable coding agents while keeping worker coding practices, TDD workflows, commit-message styles, and custom PR body templates unscripted. Adopting `go-ahead` updates `kinasr-skills`'s Scope Boundary and Non-Goals in `README.md` and `docs/designs/kinasr-skills.md` to include execution orchestration, combined PR creation, and pre-PR review while preserving the non-prescriptive coding boundary. On hosts without fresh-context subagents, `go-ahead` halts before reading source code and names the single top-ranked unblocked `ready:direct` ticket to implement directly.

## The Problem

1.  **Execution gap after backlog preparation:** `triage`, `backlog-audit`, and `to-tickets` produce ordered queues of `ready:direct` tickets, yet `kinasr-skills` provides no tracker-aware orchestrator that converts those queues into verified branches and a combined PR without manual worktree setup, branch integration, and manual dependency tracking.
2.  **Merge collisions, drift, and broken PR metadata in ad-hoc parallel runs:** Launching parallel coding agents manually causes overlapping file edits, dirty working trees, execution of tickets whose `Blocked by` items remain open (`ready:direct` means scope-ready only), silent test regressions across siblings, and inaccurate `Closes #<N>` metadata when one ticket fails or drifts mid-run.
3.  **Public-repo security and host-portability traps:** Forwarding raw public issue titles, bodies, and external comments directly to shell-capable workers exposes local credentials and git configuration or hooks to indirect prompt injection. Hardcoding parent-directory manual worktrees breaks workspace-confined sandboxes and violates `scripts/validate-repo.mjs` (`FORBIDDEN_PATH_REGEX`), while bundling coding, TDD, or PR-formatting checklists fails `PRESCRIPTIVE_CODING_REGEX` and overrides host-native coding behavior.
4.  **Unlogged out-of-scope defects during multi-ticket runs:** Workers frequently discover unrelated defects while coding; letting workers file issues mid-run risks unscreened or duplicate tracker mutations, whereas discarding findings loses actionable bug context unless surfaced for end-of-run user approval.

`go-ahead` resolves these gaps by separating Coordinator planning from local-only worker execution, verifying `Blocked by` closure and `STATE_DRIFT` before dispatch and merge, isolating workers in host-native worktrees or sequential per-ticket branches, verifying each wave at a Wave Integration Gate on one integration branch (bisecting individual commits only on wave failure), running one read-only Adversarial PR Review pass before pushing, and gating both execution and remote mutations behind explicit `Propose -> Approve -> Apply` checkpoints.

## Goals

*   Ship `go-ahead` as the 6th self-contained, bare-named, user-invoked (`disable-model-invocation: true`) skill under `skills/go-ahead/` (`SKILL.md` ~60–90 lines plus skill-local `./references/` sub-protocols), keeping `.agents/work-tracking.md` at `Schema: 1` with zero new required keys.
*   Enforce strict `ready:direct` eligibility, direct `Blocked by` closure checks, deterministic backlog ranking, bounded batch sizes, and parallel wave concurrency caps.
*   Halt immediately with zero source-code reads on hosts lacking fresh-context subagents, naming the single top-ranked unblocked `ready:direct` ticket for direct work.
*   Isolate concurrent workers using host-native worktrees (with sequential `concurrency = 1` ephemeral-branch fallback), enforce a strictly clean working tree in Preflight, and record a pre-wave verification baseline on the target branch commit.
*   Protect public-repo runs with Coordinator-only `<untrusted_ticket_data>` framing, strict non-maintainer/unverified author screening, human-approved sanitized Task Briefs for local-only workers, segmented pre-merge diff and `$GIT_COMMON_DIR` checks, `STATE_DRIFT` checks, and `CIRCUIT_OPEN` protection on `401`/`403`/`429`.
*   Land each ticket as a single commit onto the integration branch and verify each wave at a Wave Integration Gate (bisecting individual commits only on wave failure, auto-requeuing unpredicted sibling merge collisions onto updated integration HEAD without consuming implementation/test retries), cap local implementation/test retries at `3` per ticket, and halt immediately on external blockers, missing environments, or permission requests with preserved git state and `--resume` recovery.
*   Run one fresh-context read-only Adversarial PR Review pass before pushing or opening the PR, then require a second `Propose -> Approve -> Apply` gate before remote `git push`, combined PR creation (`Closing Rule` from verified-merged commits), and untriaged `bug`-only out-of-scope issue proposals, without auto-merging to the default branch.
*   Update `README.md`, `docs/designs/kinasr-skills.md` (Scope Boundary and Non-Goals while preserving historical `v0.1.0` records), `scripts/validate-repo.mjs`, and `scripts/validate-repo.test.mjs` for 6-skill cross-OS CI parity.

## Non-Goals

*   Prescribing worker coding practices, TDD workflows, commit-message styles, or PR body formatting templates beyond `./AGENTS.md` `Closing Rule`.
*   `<epic-or-spec>` scoping from [GitHub Issue #5](https://github.com/Kinasr/skills/issues/5) (deferred in v1; users invoke `/kinasr-skills:go-ahead` unscoped or with explicit ticket IDs).
*   Auto-merging pull requests to the default branch or mutating remote branches, PRs, or issues without explicit `Propose -> Approve -> Apply` approval.
*   Mutating `in-progress` tracker labels mid-run (leaving tracker labels read-only during execution to avoid stale WIP labels on halt).
*   Running unbounded automated fix loops after Adversarial PR Review.
*   Auto-invoking `setup-flow`, `triage`, `backlog-audit`, `to-tickets`, or `handoff`.
*   Running multi-ticket batch execution sequentially in a single context on hosts that lack fresh-context subagents.
*   Breaking `.agents/work-tracking.md` `Schema: 1` backward compatibility or introducing plugin-external shared adapters, wrapper scripts, or git symlinks.

## Critical User Journeys (CUJs)

### CUJ 1: Parallel Multi-Wave Execution & Combined PR

*   **Given:** A repository with `.agents/work-tracking.md` (or inferred `gh`/`glab` remote), a strictly clean working tree, a subagent-capable host (Antigravity CLI or Claude Code), and up to 6 unscoped (or up to 10 explicit) unblocked `ready:direct` tickets.
*   **When:** The user invokes `/kinasr-skills:go-ahead` (unscoped or with explicit ticket IDs), confirms the Dry-Run execution plan, verification command, and sanitized Task Briefs at Gate 1, and approves the post-review push/PR proposal at Gate 2.
*   **Then:** The Coordinator partitions tickets into dependency- and overlap-ordered waves (`2–3` workers per wave), runs workers in isolated worktrees, merges worker commits sequentially onto one integration branch after `STATE_DRIFT` and diff-policy checks, verifies each wave at a Wave Integration Gate (bisecting individual commits only on wave failure), runs one fresh-context read-only Adversarial PR Review pass reporting Blockers/Risks/Suggestions, pushes the integration branch and opens one combined PR targeting `origin/<default-branch>` with `Closes #<N>` covering strictly verified-merged tickets (plus any approved untriaged out-of-scope bug issues), emits an Execution Receipt table, and stops without auto-merging.

### CUJ 2: Public-Repo Untrusted Input & Sensitive-Path Protection

*   **Given:** A public repository where targeted `ready:direct` issues or comments were authored by non-maintainers or unverified/unknown authors, or where a worker change modifies sensitive paths or build/lock manifests.
*   **When:** The user invokes `go-ahead` on those tickets and reviews the Dry-Run Gate 1 opt-in flags, pre-authorizations, and any per-diff manifest review prompts.
*   **Then:** The Coordinator wraps external reads in `<untrusted_ticket_data>`, excludes external comments by default, flags non-maintainer/unverified issue bodies and skipped comments in Gate 1 for explicit opt-in or drop (cascading `SKIPPED (UPSTREAM_UNRESOLVED)` to downstream dependents if dropped), requires Gate 1 pre-authorization for hard-blocked security paths, quarantines unexpected build/lock manifest edits for per-diff approval, sends only human-approved Task Briefs to local-only workers (zero `git push`, `gh`, or `glab` inside workers), and aborts immediately on `$GIT_COMMON_DIR` tampering.

### CUJ 3: Retry Cap, External Blocker Halt & `--resume` Recovery

*   **Given:** An active `go-ahead` run where a ticket hits an unpredicted sibling merge conflict, fails local verification repeatedly, pauses at Gate 2 for `BLOCKERS_FOUND`, or encounters an external blocker, missing untracked dependencies (`ENV_SETUP_REQUIRED`), or missing permission (`PERMISSION_REQUIRED`).
*   **When:** Sibling merge collisions occur, implementation/test retries reach the 3-attempt cap, Gate 2 pauses for local blocker edits, or a halt occurs, and the user resolves the cause and invokes `go-ahead --resume [<integration_branch> | path | json]`.
*   **Then:** Unpredicted sibling merge collisions auto-requeue onto the updated integration HEAD without consuming implementation/test retries. On any halt or pause, the orchestrator cleans up temporary worker worktrees/branches while preserving `integration_branch` and emits a minimal versioned JSON Resume Pointer (`schema: 1`, `skill: "go-ahead"`). On `--resume`, it verifies `integration_branch` and `base_sha` ancestry, derives landed tickets from `<base_sha>..HEAD`, warns if `origin/<default-branch>` advanced, re-checks live `STATE_DRIFT` on remaining tickets, and either re-enters Gate 1 (resetting retry counters) or re-verifies `integration_branch` and re-enters Phase 4 -> Gate 2 after local blocker fixes.

### CUJ 4: Graceful Halt on Subagent-Less Hosts

*   **Given:** A host environment without fresh-context subagent support (such as Standalone Antigravity IDE) and a repository containing unblocked `ready:direct` tickets.
*   **When:** The user invokes `go-ahead`.
*   **Then:** The skill detects the lack of fresh-context subagent support during Preflight before reading any repository source code, warns that parallel wave execution requires isolated subagents, performs at most one metadata-only backlog fetch (scanning ranked candidates until finding an unblocked item), prints the single top-ranked unblocked `ready:direct` ticket (`bug` -> configured `Priority Labels` left-to-right -> oldest `created_at`) for direct work, and halts.

## Technical Plan (Architecture)

### 1. Contract Glossary (Self-Contained Definitions)

*   **`STATE_DRIFT`:** A mismatch detected when re-reading live tracker state compared to initial screening: the ticket is no longer open, lost `ready:direct`, entered an excluded active/terminal state, gained an open `Passive WIP Signal` PR, gained an unresolved blocker, or changed its body/acceptance criteria.
*   **`STATE_CONFLICT`:** An inconsistent ticket state where conflicting labels coexist (e.g., `ready:direct` combined with an excluded state like `in-progress` or `in-review`). Conflicting tickets are excluded and surfaced for user cleanup.
*   **`CIRCUIT_OPEN`:** An immediate remote-mutation circuit breaker triggered by HTTP `401`, `403`, or `429` responses (or equivalent CLI auth/rate-limit errors). When tripped, remaining remote writes are aborted and recorded as `SKIPPED (CIRCUIT_OPEN)` without automatic retries.
*   **`.agents/work-tracking.md` (`Schema: 1`) Fields:**
    *   `Excluded Active/Terminal States`: Labels/states treated as already in work or finished (`in-progress`, `in-review`, `done`, `closed`).
    *   `Passive WIP Signal`: Heuristic for open work (default `open linked PRs` referencing the ticket).
    *   `native_deps`: Boolean indicating whether the tracker exposes structured blocking relationships alongside prose links.
    *   `Priority Labels`: Ordered left-to-right priority list (highest first), or `none` when skipped in ranking.
    *   `ID Pattern`: Custom regex for non-GitHub/GitLab ticket keys (`none` disables custom prefix matching).
    *   `Max Backlog Scan`: Upper bound on open tickets fetched during unscoped backlog discovery (`150` default).
*   **`UNVERIFIED (REF_CAP_REACHED)`:** Status applied when direct blocker inspection exceeds the `<= 30` referenced-ID budget, causing unresolved dependency status to exclude the candidate conservatively.
*   **Zero-Code-Read Subagent Probe:** Checking host runtime capability metadata/tools (e.g., `invoke_subagent`, Claude Code `Agent`/`Task`) before opening any repository source files; hosts lacking isolated subagents halt with metadata-only top-1 guidance.
*   **`triage` 3-Line Plan Comment:** Standardized short maintainer/triage summary embedded in a ticket thread listing scope, target files/modules, and verification intent. Used as an optional hint source for file-overlap wave splitting; tickets without it remain eligible.
*   **`./AGENTS.md` `Pre-Implementation Check`:** Repository rule stating `ready:direct` means scope-ready only: agents must verify `Blocked by` items are closed and inspect merged upstream diffs before coding.
*   **4-State Verification Freshness Precedence:** Ordered from highest risk to lowest: `FAILED_ON_CURRENT_DIFF` (last verification command failed after final edit on the target branch) > `STALE_PRE_EDIT` (checks passed only before subsequent edits) > `VERIFIED_ON_CURRENT_DIFF` (checks ran and passed on exact current HEAD) > `UNVERIFIED` (no verification command configured or run).
*   **`DENYLISTED_PLANNER_COMMANDS` Compliance:** Validator check in `scripts/validate-repo.mjs` barring `/egm*` planner slash-command invocations inside `kinasr-skills` prompts; git worktree, merge, and local test commands are permitted.

### 2. Self-Contained Skill Packaging & Phase-Local Split

`go-ahead` follows the self-contained directory contract under `skills/go-ahead/` (zero symlinks, zero plugin-external paths, zero manifest edits because root `plugin.json` and `.claude-plugin/*.json` auto-discover `./skills/`):

```text
skills/go-ahead/
├── SKILL.md                           # ~60-90 lines: Preflight, Subagent Probe, Safety Contract, State-Machine Router
└── references/
    ├── wave-planning.md               # Eligibility, direct blocker checks, ranking, waves, author trust, Gate 1 & Task Briefs
    ├── execution-and-resume.md        # 2-tier worktrees, baseline, worker JSON, diff/$GIT_COMMON_DIR, merges, retries, --resume
    └── review-and-pr.md               # 1 read-only Adversarial PR Review pass, Gate 2, combined PR, out-of-scope bugs, Receipt
```

*   `SKILL.md` declares frontmatter `name: go-ahead`, `description`, `license: MIT`, and `disable-model-invocation: true`.
*   All cross-file links inside `skills/go-ahead/SKILL.md` use explicit `./references/<file>.md` paths so `scripts/validate-repo.mjs` passes on macOS, Linux, and Windows.
*   `.agents/work-tracking.md` remains at `Schema: 1` with zero new mandatory keys.

### 3. End-to-End Orchestration State Machine

```text
[/kinasr-skills:go-ahead [IDs | --resume [<integration_branch>|path|json]]]
  │
  ▼
[Phase 1: Preflight & Subagent Probe]
  ├─ Config: .agents/work-tracking.md (Schema: 1) | inferred gh/glab | none -> HALT (run setup-flow)
  ├─ Git: print Run Context Header -> <no-git> or <unborn-HEAD>? HALT
  │  -> require strictly clean working tree (git status --porcelain empty; otherwise HALT)
  │  -> resolve base_sha from origin/<default-branch> (after git fetch origin) or confirmed local branch
  ├─ Subagent probe (ZERO source code reads): unavailable? -> metadata-only top-1 unblocked ready:direct -> HALT
  └─ --resume? -> jump to Git-Grounded Resume Reconciliation
  │
  ▼
[Phase 2: Bounded Discovery, Blocker Checks & Wave Partitioning] (./references/wave-planning.md)
  ├─ Scan open backlog (Max Backlog Scan: 150, oldest-first where supported); filter eligible ready:direct
  ├─ Apply unscoped cap (6 post-filter) or explicit ID cap (10 per-run cap); rank: bug -> Priority Labels -> oldest created_at
  ├─ Direct Blocked by checks (<=30 external IDs; native_deps + fenced-code-block-aware prose); route cycles to backlog-audit
  ├─ Wrap external text in <untrusted_ticket_data>; classify authors using exact GitHub/GitLab/custom allowlists
  └─ Topological wave split by intra-batch Blocked by + overlap hints (2-3 concurrent workers/wave)
  │
  ▼
[GATE 1: Propose -> Approve -> Apply (Dry-Run)]
  ├─ Show wave plan, verified/edited test command, integration_branch name (go-ahead/<slug>-<YYYYMMDD> or go-ahead/<primary-key>-<slug>-<YYYYMMDD> on custom),
  │  flagged non-maintainer/unverified bodies & skipped comments (opt-in/drop -> cascade UPSTREAM_UNRESOLVED),
  │  pre-authorized hard-blocked paths, and compile approved sanitized Task Briefs
  └─ Declined or 0 eligible tickets -> HALT (zero branches, zero workers)
  │
  ▼
[Phase 3: Baseline & Isolated Wave Execution] (./references/execution-and-resume.md)
  ├─ Create/checkout integration_branch from base_sha; run baseline verification once (pause on FAILED_ON_CURRENT_DIFF)
  ├─ Snapshot git-native common config & non-.sample hooks (git rev-parse --git-common-dir)
  └─ For each Wave k = 1..K (primary workspace holds integration_branch HEAD; Wave k+1 branches from Wave k HEAD):
       ├─ Provision 2-tier isolation: Host-Native (Workspace: "share" / isolation: "worktree") -> Sequential (concurrency = 1 on go-ahead-wt/<ticket-id>)
       ├─ Dispatch local-only workers with approved Task Briefs + Wave k-1 merged diff summaries
       ├─ Sequential Integration Merge (per committed worker branch):
       │    ├─ Pre-merge STATE_DRIFT re-check -> drifted? SKIPPED (STATE_DRIFT) + cascade SKIPPED (UPSTREAM_UNRESOLVED)
       │    ├─ Segmented Diff Policy (Hard-Blocked Security Paths vs. Review-Gated Build Manifests) + git-native common dir check
       │    ├─ Trial single-commit merge (git merge --squash) onto integration_branch
       │    ├─ Sibling merge collision? -> reset trial merge, requeue onto updated HEAD (0 retries consumed)
       │    └─ BLOCKED_EXTERNAL / PERMISSION_REQUIRED / ENV_SETUP_REQUIRED? -> HALT + Resume Pointer ($GIT_COMMON_DIR tamper -> hard abort, no pointer)
       └─ Wave Integration Gate: run confirmed verification once on integration_branch HEAD (baseline regression check)
            └─ Failure? -> bisect Wave k commits, roll back only failing commit, retry failing ticket in fresh worktree (up to 3 attempts) -> cap hit? HALT + Resume Pointer
  │
  ▼
[Phase 4: Adversarial PR Review] (./references/review-and-pr.md) (skip if merged_tickets.length === 0)
  └─ 1 fresh-context read-only subagent (research / Explore) on <base_sha>..HEAD + Task Briefs + AGENTS.md
     -> outputs structured Markdown (Review Status, Blockers, Risks, Suggestions); ERROR -> offer 1 retry or halt
  │
  ▼
[GATE 2: Propose -> Approve -> Apply (Push, PR & Out-of-Scope Bugs)]
  ├─ Present Adversarial Review report, freshness status, post-merge STATE_DRIFT choices (revert / keep without ref / abort),
  │  dynamic Closing Rule list (strictly verified-merged commits), and untriaged bug-only out-of-scope proposals
  ├─ Pause for local BLOCKERS_FOUND edits? -> emit Resume Pointer (remaining_ticket_ids: [])
  ├─ Pre-apply CIRCUIT_OPEN on 401/403/429; push integration_branch (skipped if remote-less local repo) + open 1 combined PR (NEVER auto-merge)
  ├─ File approved untriaged bug issues (bug label only, zero ready:*, SKIPPED (DUPLICATE_EXISTS), provenance footer)
  └─ Emit canonical Execution Receipt Markdown table (plus Resume Pointer JSON only on partial Gate 2 apply) -> STOP
```

### 4. Eligibility, Direct Blocker Checks, Ranking & Overlap Partitioning

*   **Zero-Code-Read Subagent Probe:** Runs before reading any repository source files. If the host lacks fresh-context subagents (e.g., Standalone Antigravity IDE), `go-ahead` performs at most one metadata-only backlog fetch (scanning ranked candidates until finding one unblocked `ready:direct` item via direct `Blocked by` check), prints that single ticket (`bug` -> left-to-right `Priority Labels` -> oldest `created_at` ascending), and halts.
*   **Eligibility, `Max Backlog Scan` & Selection Caps:** Reads up to `Max Backlog Scan: 150` open issues (oldest-first query ordering where supported, disclosing truncation if capped). Candidates must carry `ready:direct` and exclude `epic`, `Excluded Active/Terminal States`, active `Passive WIP Signal` (`open linked PRs`), and unresolved `STATE_CONFLICT`. Direct `Blocked by` inspection (`<= 30` referenced external IDs, union of `native_deps` when `true` and fenced-code-block-aware prose `Blocked by:?` directives) excludes tickets with open or `UNVERIFIED (REF_CAP_REACHED)` external blockers; any cycle or graph anomaly detected among candidates is excluded and routed to `backlog-audit` rather than duplicating full SCC graph traversal inside `go-ahead`. Unscoped runs apply the `6`-ticket cap *after* eligibility and blocker filtering (disclosing remaining eligible count); explicit ID runs enforce a **per-run cap of 10** (reporting disqualified explicit IDs and prompting to narrow or take top 10 when `> 10` IDs are supplied). Intentional tie-breaker alignment: `oldest created_at ascending` matches `triage` batch ordering rather than `kinasr-skills.md` Actionable Frontier (`updated_at`). If zero eligible unblocked tickets remain, report skipped reasons and stop.
*   **Overlap-Aware Wave Partitioning & Downstream Cascade:** Intra-batch `Blocked by` edges enforce topological wave order (`Wave k` merges before `Wave k+1` starts). Within each layer, file/module hints come from `triage` 3-line plan comments, ticket acceptance criteria, or validated repo-relative `Spec:` pointers; tickets sharing predicted paths are split across waves (`2–3` concurrent workers/wave). Tickets without a 3-line plan remain eligible and rely on body hints or `COLLISION_REQUEUE`. Dropping any ticket at Gate 1 (including declined non-maintainer issue bodies) or skipping via mid-run `STATE_DRIFT` cascades `SKIPPED (UPSTREAM_UNRESOLVED)` transitively to all dependent downstream tickets.

### 5. Public-Repo Trust Boundary, Pre-Merge Diff Policy & Worktree Contract

*   **Untrusted Framing & Exact Author Role Allowlists:** All external tracker titles, bodies, comments, and PR metadata read by the Coordinator stay wrapped in `<untrusted_ticket_data>...</untrusted_ticket_data>`. Author trust classification uses exact role allowlists:
    *   **GitHub:** Maintainers = `author_association` in `OWNER`, `MEMBER`, `COLLABORATOR`; Non-maintainers = `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, `FIRST_TIMER`, `MANNEQUIN`, `NONE`, null, or unknown.
    *   **GitLab:** Maintainers = project role `Maintainer` or `Owner` (access level `>= 40`); Non-maintainers = `Developer`, `Reporter`, `Guest`, null, or unqueryable.
    *   **`custom` trackers:** Treated as non-maintainer unless verified maintainer/owner metadata exists; consequently, when `custom` role metadata is absent, every candidate issue body surfaces for explicit Gate 1 user opt-in.
*   **Gate 1 Opt-In & Sanitized Task Briefs:** Non-maintainer/unverified comments are excluded by default; non-maintainer/unverified bodies and skipped comments are flagged in Gate 1 for opt-in or drop. `Spec:` pointers are validated as clean repo-relative paths (rejecting absolute paths, `..` traversal, symlinks, or paths outside repo root). Gate 1 also confirms/edits repository verification command(s) (discovered from `./AGENTS.md` and root project manifests `package.json`, `Makefile`, `pyproject.toml`, `Cargo.toml`, `go.mod`; `none` sets `UNVERIFIED`), `<slug>` branch naming (`go-ahead/<slug>-<YYYYMMDD>` on `github`/`gitlab`, or `go-ahead/<primary-key>-<slug>-<YYYYMMDD>` on `custom`, `-2`/`-3` on same-day collision, lowercase kebab-case `<= 32` chars avoiding extra bare ticket keys or dates), and any pre-authorized sensitive paths. Approved **Task Briefs** (ANSI/control-char/unsafe-HTML stripped) contain solely `ticket_id`, `approved_objective`, `acceptance_criteria`, validated `Spec:` path (if any), `Wave k-1` merged diff summaries, and `pre_authorized_paths`. Workers never receive raw `<untrusted_ticket_data>` and never invoke `git push`, `gh`, `glab`, or remote tracker writes.
*   **Segmented Pre-Merge Diff Policy & Git-Native Common-Dir Guard:** Before merging any worker commit, the Coordinator inspects `git diff --name-status --raw <integration-HEAD>..<worker-HEAD>` across the repository tree:
    *   **Hard-Blocked Security Invariants (require Gate 1 pre-authorization; otherwise abort merge and halt with Resume Pointer):** `.git/`, `.github/workflows/`, git hooks, `.env*` (at root or any nested path), git symlink mode `120000`, git submodule mode `160000`, `.agents/`, `AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md`.
    *   **Review-Gated Build/Lock Manifests (at root or nested path):** `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `Cargo.toml`, `Cargo.lock`, `go.mod`, `go.sum`, `pyproject.toml`, `requirements*.txt`, `Gemfile*`, `Makefile`. Unauthorized edits quarantine on the worker branch and prompt the user per diff before merging or dropping.
    *   **Git-Native Shared-Repo Guard:** Instead of platform-specific shell checksums, snapshot `git config --local --list` and non-`.sample` hook filenames/sizes under `$(git rev-parse --git-common-dir)/hooks` before Wave 1 and re-verify before every merge. Any mismatch triggers an immediate hard abort **without** emitting a Resume Pointer.
*   **Clean-Tree Preflight, 2-Tier Isolation & Primary-Workspace Rule:** Preflight halts on `<no-git>`, `<unborn-HEAD>`, or any dirty tree (`git status --porcelain` non-empty). When `origin` exists, run `git fetch origin` and resolve `origin/<default-branch>` dynamically via `git symbolic-ref refs/remotes/origin/HEAD` (fallback `origin/main`, `origin/master`, or user prompt). If no `origin` exists, require user confirmation to branch from the local default branch and skip remote push at Gate 2. After Wave `k` merges, the primary workspace remains on `integration_branch`; before spawning Wave `k+1`, verify each host-native worktree (`Workspace: "share"` on Antigravity or `isolation: "worktree"` on Claude Code) branches from current `integration_branch` HEAD (creating local `go-ahead-wt/<ticket-id>` at current `integration_branch` HEAD if needed). When host-native isolation is unavailable, fall back to **Tier 2 Sequential (`concurrency = 1`)**: create ephemeral local branch `go-ahead-wt/<ticket-id>` from `integration_branch` HEAD, run one worker at a time, inspect `<integration-HEAD>..<worker-HEAD>`, clean leftover untracked artifacts after committed edits (`git clean -fd`, or `git reset --hard && git clean -fd` on abort), check out `integration_branch`, and delete `go-ahead-wt/<ticket-id>` (`git branch -D`) on abort. Temporary worktrees/branches are always removed at wave completion and on halt.
*   **Baseline, Worker Commit Rules, Single-Commit Merges, Wave Integration Gate & 3-Retry Loop:** Run confirmed verification command(s) once on `base_sha` before Wave 1; if `FAILED_ON_CURRENT_DIFF`, pause for explicit user confirmation and fail subsequent Wave Integration Gates only on new regression signatures while surfacing `FAILED_ON_CURRENT_DIFF` at Gate 2. Workers run local verification inside their isolated worktrees and must commit edits inside their isolated branch before returning `branch_or_head_sha`; zero-diff `OK` exits normalize to `ERROR`. After `STATE_DRIFT` and diff-policy checks pass, integrate each Wave `k` commit sequentially via single commit (`git merge --squash <worker-head> && git commit -m "<ticket-id>: <sanitized summary>"`; abort failed merges via `git reset --merge` or `git reset --hard HEAD && git clean -fd`). Missing untracked dependency errors (`node_modules/`, `.venv/`, `.env`) return `ENV_SETUP_REQUIRED` and halt immediately (advising setup or `concurrency = 1`) without consuming retries. Unpredicted sibling merge collisions abort the trial merge and requeue (`COLLISION_REQUEUE`, `0` retries consumed). Run the confirmed verification command(s) once at a **Wave Integration Gate** on `integration_branch` HEAD after existing Wave `k` merges finish; once green, execute any `COLLISION_REQUEUE` tickets sequentially (`concurrency = 1`) onto verified `integration_branch` HEAD and re-verify. If any Wave Integration Gate fails, use cumulative `git bisect` or incremental replay from `<pre-wave-k-sha>` (`commit 1`, `commit 1 + commit 2`, ...) to isolate and roll back only the failing commit, then retry the failing ticket using a fresh worktree from updated `integration_branch` HEAD up to **3 attempts** per ticket before halting with a Resume Pointer. Tracker labels stay read-only mid-run.

### 6. Structured Contracts & Git-Grounded `--resume`

#### Coding Worker Nullable JSON Envelope

```json
{
  "ticket_id": "<string>",
  "execution_status": "OK | BLOCKED_EXTERNAL | PERMISSION_REQUIRED | ENV_SETUP_REQUIRED | ERROR",
  "branch_or_head_sha": "<string | null>",
  "modified_paths": ["<string>"],
  "verification": {
    "freshness": "FAILED_ON_CURRENT_DIFF | STALE_PRE_EDIT | VERIFIED_ON_CURRENT_DIFF | UNVERIFIED",
    "commands": ["<string>"],
    "log_tail": "<string | null>"
  },
  "summary": "<string | null>",
  "out_of_scope_bugs": [
    {
      "title": "<string>",
      "evidence": "<string>",
      "affected_paths": ["<string>"]
    }
  ],
  "blocker_detail": "<string | null>"
}
```

#### Adversarial PR Reviewer Output (Structured Markdown)

Executed once after all waves complete (skipped if zero tickets merged) using one fresh-context read-only subagent (`research` on Antigravity, `Explore` on Claude Code, read-only prompt elsewhere) receiving strictly `<base_sha>..HEAD` unified diff, approved Task Briefs, `AGENTS.md`, and integration verification freshness (zero raw `<untrusted_ticket_data>`). Returns concise Markdown sections: `## Review Status` (`PASS | PASS_WITH_RISKS | BLOCKERS_FOUND`), `## Blockers`, `## Risks`, and `## Suggestions`. Malformed output or tool failure surfaces at Gate 2 offering one reviewer retry or manual halt. Coordinator constructs `Closing Rule` strictly from verified `merged_tickets` + live `STATE_DRIFT`.

#### Git-Grounded `--resume` Pointer JSON (Emitted Only on Halt, Gate 2 Pause, or Partial Gate 2 Apply)

```json
{
  "schema": 1,
  "skill": "go-ahead",
  "integration_branch": "<branch-name>",
  "base_sha": "<40-char-sha>",
  "default_branch": "<origin/default-branch | local-default-branch>",
  "remaining_ticket_ids": ["<string>"],
  "out_of_scope_bugs": [
    { "title": "<string>", "evidence": "<string>", "affected_paths": ["<string>"] }
  ],
  "halt_reason": "<string>"
}
```

*   **Resume Reconciliation:** On `--resume [<integration_branch> | path | json]`, validate `schema === 1` and `skill === "go-ahead"` (when JSON/path provided; if only `<integration_branch>` is provided, resolve `base_sha` via `git merge-base <default-branch> <integration_branch>` and default `remaining_ticket_ids` to `[]` unless supplied/confirmed) plus syntactic ID allowlists on all `ticket_id` fields and sanitized strings; verify `<integration_branch>` exists and `base_sha` is an ancestor and explicitly `git checkout <integration_branch>`; derive landed ticket IDs directly from `<base_sha>..HEAD` commit subjects excluding net-reverted `^Revert "<ticket-id>:` commits; warn and offer rebase/continue/abort if `origin/<default-branch>` moved beyond `base_sha`; re-check live `STATE_DRIFT` on remaining tickets; and confirm re-entry into **Gate 1** (resetting retry counters and re-confirming untrusted bodies/Task Briefs if `remaining_ticket_ids` is non-empty) or re-verify `integration_branch` and re-enter **Phase 4 -> Gate 2** (if `remaining_ticket_ids` is empty after Gate 2 blocker edits).

### 7. Gate 2 (`Propose -> Approve -> Apply`), Combined PR, Out-of-Scope Bugs & Validator Parity

*   **Gate 2 Proposal & Post-Merge Drift Handling:** Present (a) Adversarial Review report and integration freshness (allowing pause -> Resume Pointer if `BLOCKERS_FOUND`), (b) any post-merge `STATE_DRIFT` on `merged_tickets` with explicit choices: `git revert` the landed commit + re-verify, keep code explicitly without a closing ref, or abort PR creation, (c) remote `git push` target (omitted for local-only repos) and single combined PR to `origin/<default-branch>` with `Closes #<N>` on `github`/`gitlab` or `custom` tracker keys (`go-ahead/<primary-key>-<slug>-<YYYYMMDD>` branch created in Phase 3, `<= 3` keys in PR title, full key list in PR body; or manual PR instructions when CLI/MCP lacks PR creation) and **zero** auto-merge, and (d) untriaged `bug`-only out-of-scope bug proposals (`bug` type label only, zero `ready:*` or `needs-info` labels, 3-field body: Summary/Evidence/Affected Paths). If `merged_tickets.length === 0`, skip Phase 4 and PR/push creation completely while surfacing any captured `out_of_scope_bugs` when non-empty.
*   **Pre-Apply Guards & Execution Receipt:** Apply `CIRCUIT_OPEN` immediately on `401`/`403`/`429`. Run normalized case-insensitive open-issue title duplicate checks (`SKIPPED (DUPLICATE_EXISTS)`) and append branch-free provenance footers (`<!-- kinasr-skills: go-ahead | <YYYY-MM-DDTHH:MM:SSZ> | <short-sha|no-sha> -->` or `[kinasr-skills: go-ahead | <YYYY-MM-DDTHH:MM:SSZ> | <short-sha|no-sha>]`) when filing approved out-of-scope bugs. Gate 2 emits the canonical Markdown Execution Receipt table (`target_id`, `operation`, `outcome` using `APPLIED` / `SKIPPED (STATE_DRIFT)` / `SKIPPED (DUPLICATE_EXISTS)` / `SKIPPED (CIRCUIT_OPEN)` / `SKIPPED (UPSTREAM_UNRESOLVED)` / `ERROR`, `URL/path`, `error/resume detail`) and stops (emitting a Resume Pointer JSON only if Gate 2 hit partial apply errors or paused).
*   **Validator & Documentation Parity:** Register `'go-ahead'` in `REQUIRED_SKILLS`, `UNTRUSTED_DATA_SKILLS`, `STATE_DRIFT_SKILLS`, `CIRCUIT_OPEN_SKILLS`, and `PROVENANCE_FOOTER_SKILLS` inside `scripts/validate-repo.mjs`; add matching positive/negative tests in `scripts/validate-repo.test.mjs`; update `README.md` and `docs/designs/kinasr-skills.md`.

## Alternatives Considered

### Alternative 1: Thin Worker Launcher Only (No Combined PR, No Retry Loop, No Adversarial Review)

*   **Pros:** Keeps orchestration minimal, removes cross-ticket integration merges, and preserves the original `v0.1.0` toolkit boundary that excluded PR creation and code review.
*   **Cons:** Leaves users to reconcile worker branches, resolve local test/merge failures, assemble `Closing Rule` metadata, and run pre-PR review manually, failing to deliver an end-to-end execution workflow.
*   **Reason for Rejection:** End-to-end wave integration, bounded 3-retry local recovery, combined PR creation (`Closing Rule`), and one read-only Adversarial PR Review pass are core requirements for closing the `ready:direct` workflow while keeping worker coding practices unscripted.

### Alternative 2: One Branch and One PR per Ticket by Default

*   **Pros:** Matches `triage`'s single-PR `ready:direct` sizing, isolates CI failures per ticket, and removes sequential integration merging on a shared branch.
*   **Cons:** Multiplies review queues and PR overhead when a user intentionally selects a related batch of tickets to land together.
*   **Reason for Rejection:** The primary batch workflow targets one combined PR on the default branch (`6` unscoped / `10` per-run explicit cap) with dynamic `Closing Rule` metadata covering strictly verified-merged commits.

### Alternative 3: Unbounded Unscoped Batch Execution (`> 10` Tickets Without Caps)

*   **Pros:** Allows attempting to clear an entire `ready:direct` backlog in a single command.
*   **Cons:** Produces oversized PRs that are difficult to review, inflates token consumption, and increases merge-conflict and `STATE_DRIFT` failure scope across waves.
*   **Reason for Rejection:** Bounded batch caps (`6` unscoped post-filter, `10` explicit per-run cap, `2–3` concurrent workers per wave) keep review scope, merge risk, and token spend controlled.

### Alternative 4: Silent Mid-Run Bug Filing Without User Approval

*   **Pros:** Records newly discovered out-of-scope bugs in the tracker immediately while context is fresh in the wave.
*   **Cons:** Breaks `Propose -> Approve -> Apply`, risks filing prompt-injected or duplicate issues mid-execution, and mixes remote write failures into the coding loop.
*   **Reason for Rejection:** Collecting out-of-scope bugs in worker JSON envelopes and gating untriaged `bug`-only proposals (`SKIPPED (DUPLICATE_EXISTS)` + provenance footer) behind Gate 2 keeps remote writes explicit and reversible.

### Alternative 5: Sequential Single-Context Batch Execution on Subagent-Less Hosts

*   **Pros:** Allows invoking multi-ticket `go-ahead` runs on hosts without fresh-context subagents (such as Standalone Antigravity IDE).
*   **Cons:** Degrades context quality across multiple tickets in one window, mixes unrelated diffs, and breaks parity with `triage` batch mode's subagent gate.
*   **Reason for Rejection:** Halting before reading repository source code and naming the single top-ranked unblocked `ready:direct` ticket preserves context quality and parity across hosts.

### Alternative 6: Parent-Directory or Repo-Subdir Manual Worktrees ([GitHub Issue #5](https://github.com/Kinasr/skills/issues/5))

*   **Pros:** Keeps temporary worktree checkouts outside the repository working tree without relying on native host isolation.
*   **Cons:** Parent-directory paths (`../wt-*`) fail workspace-confined sandboxes and violate `FORBIDDEN_PATH_REGEX`, `$TMPDIR` also writes outside workspace roots, and `.git/info/exclude` mutates shared `$GIT_COMMON_DIR` state.
*   **Reason for Rejection:** Both primary subagent harnesses (`Workspace: "share"` on Antigravity, `isolation: "worktree"` on Claude Code) provide Tier 1 native isolation while subagent-less hosts halt in Preflight, making 2-tier isolation (Host-Native -> Sequential `concurrency = 1` ephemeral branch) cleaner and portable.

### Alternative 7: Single Upfront Approval Covering Remote Push and PR Creation

*   **Pros:** Removes the second user confirmation prompt at the end of a long multi-wave run.
*   **Cons:** Allows pushing unreviewed diffs, Adversarial Review blockers, or stale `Closes #<N>` metadata after long execution phases without user inspection.
*   **Reason for Rejection:** Splitting `Propose -> Approve -> Apply` into Gate 1 (Dry-Run & Task Briefs) and Gate 2 (post-review push, PR creation, and out-of-scope bugs) guarantees remote mutations reflect verified state.

### Alternative 8: Mid-Run `in-progress` Tracker Label Mutations & Unbounded Review Auto-Fix Loops

*   **Pros:** Exposes active worker claims on the issue tracker during waves and attempts to resolve every reviewer finding automatically.
*   **Cons:** Mid-run `in-progress` writes leave stale WIP labels whenever a run halts or hits `CIRCUIT_OPEN`, requiring tracker-specific rollback across `Schema: 1` trackers; unbounded review-fix loops multiply token spend and risk oscillation.
*   **Reason for Rejection:** Keeping labels read-only mid-run (relying on pre-dispatch, pre-merge, and pre-PR `STATE_DRIFT` checks rather than PR `Passive WIP Signal`, since no PR exists until Gate 2) and capping Adversarial PR Review at one read-only pass keeps recovery deterministic and token usage bounded.

### Alternative 9: Passing Raw `<untrusted_ticket_data>` Directly to Write-Capable Workers

*   **Pros:** Simplifies Coordinator orchestration by forwarding raw issue threads straight into worker prompts.
*   **Cons:** Exposes shell- and edit-capable workers on public repositories to indirect prompt injection from external issue authors or comments.
*   **Reason for Rejection:** Isolating raw `<untrusted_ticket_data>` parsing in the Coordinator, screening non-maintainer/unverified content at Gate 1, and sending only human-approved Task Briefs to local-only workers reduces indirect prompt-injection exposure.

## Risks & Mitigations

*   **Prompt-only worker containment on unsandboxed hosts:** Local-only worker restrictions (`no git push/gh/glab`) rely on prompt boundaries where host OS network sandboxing is absent. **Mitigation:** Keep raw `<untrusted_ticket_data>` isolated inside the Coordinator, compile human-approved Task Briefs at Gate 1, enforce segmented pre-merge diff gating on `<integration-HEAD>..<worker-HEAD>`, and run git-native `$GIT_COMMON_DIR` config/hook verification before every merge.
*   **Cross-OS Markdown command/output variance:** Pure-Markdown execution runs on macOS, Linux, and Windows without bundled helper scripts. **Mitigation:** Rely exclusively on portable `git` subcommands (`git status --porcelain`, `git diff --raw`, `git merge --squash`, `git config --local --list`), normalize malformed worker JSON to `ERROR`, and use structured Markdown for single-agent Phase 4 review.
*   **Non-transactional Gate 2 remote writes (`git push` vs. PR creation / bug filing):** A remote auth/rate-limit error (`CIRCUIT_OPEN`) after `git push` succeeds leaves remote branch state updated without a PR or filed bugs. **Mitigation:** Preserve `integration_branch`, report per-operation outcomes in the Execution Receipt table, and emit a Resume Pointer / manual completion command for recovery.
*   **`concurrency = 1` throughput, default-branch drift, and missing untracked dependencies (`ENV_SETUP_REQUIRED`):** Sequential fallback serializes waves, long runs may lag behind `origin/<default-branch>`, and fresh worktrees omit untracked `node_modules/`, `.venv/`, or `.env`. **Mitigation:** Enforce `6`/`10` batch caps, check `git fetch origin` divergence at Preflight and `--resume`, and halt immediately on `ENV_SETUP_REQUIRED` to let the user bootstrap dependencies or switch to `concurrency = 1` without consuming retries.

## Non-Functional Requirements

*   **Security & Privacy:** External ticket metadata remains inside Coordinator `<untrusted_ticket_data>` using exact GitHub/GitLab/`custom` maintainer allowlists; non-maintainer comments are excluded by default and non-maintainer bodies require Gate 1 opt-in; coding workers are local-only on approved Task Briefs; pre-merge diff policy separates hard-blocked security paths from review-gated build/lock manifests and halts immediately on `$GIT_COMMON_DIR` tampering; all CLI/MCP inputs use `--`, stdin, `--body-file`, or JSON payloads with syntactic ID allowlists and branch-free provenance footers.
*   **Performance, Latency & Token Overhead:** Keeping `SKILL.md` around `~60–90 lines` with phase-local `./references/` limits idle context overhead; `Max Backlog Scan: 150`, batch caps (`6` unscoped / `10` explicit), wave concurrency (`2–3`), `4 KB` metadata caps, `<= 30` direct blocker reference caps, `40`-line log tails, `3`-retry caps, and a single Adversarial PR Review pass keep token spend bounded.
*   **Rollout, Backward Compatibility & Rollback:** `.agents/work-tracking.md` remains `Schema: 1`, manifests need no edits via `./skills/` auto-discovery, existing five skills remain unchanged, and local rollback removes temporary worktrees/branches and the local `integration_branch` without altering remote default branches or mid-run tracker labels.

## Open Questions

None.

## Additional Resources

*   Toolkit architecture & design decisions: [kinasr-skills.md](./kinasr-skills.md)
*   Plugin overview & verification records: [README.md](../../README.md)
*   Work tracking configuration (`Schema: 1`): [.agents/work-tracking.md](../../.agents/work-tracking.md)
*   Repository agent rules (`Closing Rule` & `Pre-Implementation Check`): [AGENTS.md](../../AGENTS.md)
*   Repository boundary & contract validator: [validate-repo.mjs](../../scripts/validate-repo.mjs)
*   Feature request & triage notes: [GitHub Issue #5](https://github.com/Kinasr/skills/issues/5)

--------------------------------------------------------------------------------

## Detailed Implementation Plan

All changes required to ship `go-ahead` as the 6th self-contained skill with validator, test, and documentation parity (8 implementation files plus this design doc — 9 files total: 5 created, 4 modified across 3 ordered checkpoints; `plugin.json` and `.claude-plugin/plugin.json` bumped to `0.2.0` for release packaging; `.claude-plugin/marketplace.json`, `.agents/work-tracking.md`, and the 5 existing skills require zero behavioral edits).

### Phase 1: Create `go-ahead` Skill Files (Items 1–4)

#### 1. [`skills/go-ahead/SKILL.md`](../../skills/go-ahead/SKILL.md) (Create)

*   **Type / Scope:** Skill Entry-Point Prompt (`~60–90 lines` Markdown)
*   **Rationale:** Provides the compact bare-named `go-ahead` entrypoint enforcing Preflight, subagent probing, security invariants, and `./references/` routing.
*   **Proposed Changes:**
    *   Declare YAML frontmatter: `name: go-ahead`, non-empty `description`, `license: MIT`, and `disable-model-invocation: true`.
    *   State hard boundaries: never prescribe worker coding practices, TDD workflows, commit styles, or PR body templates beyond `./AGENTS.md` `Closing Rule`; never auto-merge; never mutate `in-progress` labels mid-run; never auto-invoke sibling skills and always print harness-neutral next-step commands.
    *   **Section 1 — Run Context Header & Preflight:**
        *   Load `.agents/work-tracking.md` (`Schema: 1`) or zero-config inferred defaults matching `triage`/`to-tickets` (`Tracker` from `git remote -v` `github`/`gitlab`; `Untriaged Signal`: missing workflow label; `Workflow States`: `needs-info, ready:direct, ready:lite, ready:design`; `Excluded Active/Terminal States`: `in-progress, in-review, done, closed`; `Priority Labels`: `none`; `Passive WIP Signal`: `open linked PRs`; `Max Backlog Scan`: `150`; disambiguating multiple remotes or halting with `run setup-flow` when `Config: none`).
        *   Resolve git state (`<branch>`, `detached@<short-sha>`, `<unborn-HEAD>`, `<no-git>`), print Run Context Header (`go-ahead | Config: ... | Branch: ...`), halt on `Config: none`, `<no-git>`, `<unborn-HEAD>`, or dirty tree (`git status --porcelain` non-empty).
        *   Verify CLI/MCP auth and fetch/resolve `base_sha` from `origin/<default-branch>` (or confirmed local branch when no remote exists).
        *   Run the zero-code-read subagent probe *before reading any repository source code* (routing unavailable hosts to `./references/wave-planning.md`), and route `--resume [<integration_branch> | path | json]` to `./references/execution-and-resume.md`.
    *   **Section 2 — Shared Safety & Public-Repo Trust Contract:** Reference the rules defined in Technical Plan §4–§5 (`<untrusted_ticket_data>`, exact GitHub/GitLab/`custom` maintainer allowlists, syntactic ID allowlists, safe argument passing, sanitized Task Briefs, local-only worker boundaries, `STATE_DRIFT`, `CIRCUIT_OPEN`, and branch-free provenance footers with `<YYYY-MM-DDTHH:MM:SSZ>` timestamps).
    *   **Section 3 — Phase State-Machine Router:** Route strictly via `./references/wave-planning.md`, `./references/execution-and-resume.md`, and `./references/review-and-pr.md`, complying with `FORBIDDEN_PATH_REGEX`, `PRESCRIPTIVE_CODING_REGEX`, and `DENYLISTED_PLANNER_COMMANDS`.

#### 2. [`skills/go-ahead/references/wave-planning.md`](../../skills/go-ahead/references/wave-planning.md) (Create)

*   **Type / Scope:** Skill-Local Sub-Protocol (Phase 2: Discovery, Blocker Checks, Waves & Gate 1)
*   **Rationale:** Modularizes backlog screening, public-repo opt-in, wave planning, and Task Brief compilation away from idle `SKILL.md` context.
*   **Proposed Changes:**
    *   **Subagent-Less Fallback:** Zero source-code reads, at most one metadata-only backlog fetch scanning ranked candidates until finding one unblocked `ready:direct` item (`bug` -> left-to-right `Priority Labels` skipping `none` -> oldest `created_at` ascending), printing it and halting.
    *   **Discovery, Caps & Explicit Skips:** Bounded `Max Backlog Scan: 150` (oldest-first query ordering + truncation note); apply `6`-ticket unscoped cap post-filtering and `10` per-run cap on explicit IDs; disclose disqualified explicit IDs and stop cleanly on `0` eligible tickets; enforce `4 KB` metadata cap/ticket.
    *   **Direct `Blocked by` Inspection (`<= 30` external IDs):** Combine `native_deps` (`true`) + fenced-code-block-aware prose `Blocked by:?`; exclude open or `UNVERIFIED (REF_CAP_REACHED)` external blockers; route candidate cycles/graph anomalies to `backlog-audit`; keep intra-batch `Blocked by` chains ordered across waves and cascade `SKIPPED (UPSTREAM_UNRESOLVED)` transitively whenever an upstream slice drops or drifts.
    *   **Wave Partitioning (`2–3` Workers/Wave):** Topological layers + file/module hints from `triage` 3-line plan comments, acceptance criteria, or validated repo-relative `Spec:` pointers; keep tickets lacking 3-line plans eligible via body hints or `COLLISION_REQUEUE`.
    *   **Gate 1 (`Propose -> Approve -> Apply`) & Task Briefs:** Apply exact GitHub/GitLab/`custom` author allowlists; flag non-maintainer/unverified bodies & excluded comments for opt-in/drop; confirm verification command(s); derive `<slug>` (lowercase kebab-case `<= 32` chars avoiding bare ticket-key/date tokens) for `go-ahead/<slug>-<YYYYMMDD>` (or `go-ahead/<primary-key>-<slug>-<YYYYMMDD>` on `custom`, `-2`/`-3` suffix on collision); confirm hard-blocked sensitive path pre-authorizations; compile approved **Task Briefs** (`ticket_id`, `approved_objective`, `acceptance_criteria`, validated `Spec:` path, `Wave k-1` diff summary, `pre_authorized_paths`).

#### 3. [`skills/go-ahead/references/execution-and-resume.md`](../../skills/go-ahead/references/execution-and-resume.md) (Create)

*   **Type / Scope:** Skill-Local Sub-Protocol (Phase 3: Worktrees, Merges, Retries & `--resume`)
*   **Rationale:** Separates runtime git isolation, security verification, merge mechanics, and git-grounded `--resume` reconciliation.
*   **Proposed Changes:**
    *   **Baseline Check & Git-Native Common-Dir Snapshot:** Create/checkout `integration_branch`; run confirmed verification command(s) once on `base_sha` (pausing on `FAILED_ON_CURRENT_DIFF` and failing subsequent merges only on new regression signatures); snapshot `git config --local --list` and non-`.sample` hooks under `git rev-parse --git-common-dir`; define all 4 freshness states with `40`-line log tails.
    *   **2-Tier Worktree Provisioning:** Tier 1 Host-Native (`Workspace: "share"` / `isolation: "worktree"`) keeping `integration_branch` checked out in primary workspace so Wave `k+1` branches from Wave `k` HEAD (or `go-ahead-wt/<ticket-id>` if needed); Tier 2 Sequential (`concurrency = 1`) via ephemeral local branch `go-ahead-wt/<ticket-id>` with reset/branch-delete rollback; always clean up temporary worktrees/branches on wave completion and halt; handle `ENV_SETUP_REQUIRED` without consuming retries.
    *   **Local-Only Worker Dispatch & Nullable JSON Envelope:** Require committed worker branch edits returning `branch_or_head_sha` (mapping zero-diff `OK` or malformed JSON to `ERROR`); pass solely approved Task Briefs + Wave `k-1` summaries.
    *   **Sequential Single-Commit Merges, Segmented Diff Policy & Failure Transitions:** Pre-merge `STATE_DRIFT` (cascading `SKIPPED (UPSTREAM_UNRESOLVED)`) -> Segmented Diff Policy (Hard-Blocked Security Invariants anywhere/root vs. Review-Gated Build/Lock Manifests quarantined per diff) + git-native common-dir check (hard abort without Resume Pointer on tamper) -> `git merge --squash <worker-head> && git commit -m "<ticket-id>: <sanitized summary>"` (abort via `git reset --merge` / `git reset --hard HEAD && git clean -fd`) -> `COLLISION_REQUEUE` (0 retries) -> Wave Integration Gate (verify once per wave on `integration_branch`; on failure, bisect Wave `k` commits and roll back only the failing commit) -> fresh-worktree retries up to `3` attempts -> halt on exhaustion, `BLOCKED_EXTERNAL`, `PERMISSION_REQUIRED`, or `ENV_SETUP_REQUIRED` emitting minimal **Resume Pointer JSON**.
    *   **Git-Grounded `--resume [<integration_branch> | path | json]` Reconciliation:** Validate pointer/branch + ancestry, derive landed work from `<base_sha>..HEAD`, warn on moved `origin/<default-branch>`, re-check `STATE_DRIFT` on remaining tickets, and route cleanly to Gate 1 (resetting retries) or Phase 4 -> Gate 2 (after Gate 2 blocker edits).

#### 4. [`skills/go-ahead/references/review-and-pr.md`](../../skills/go-ahead/references/review-and-pr.md) (Create)

*   **Type / Scope:** Skill-Local Sub-Protocol (Phase 4 & Gate 2: Adversarial PR Review, Combined PR & Out-of-Scope Bugs)
*   **Rationale:** Keeps pre-push review, combined PR creation (`Closing Rule`), untriaged bug filing, and Execution Receipt reporting modular.
*   **Proposed Changes:**
    *   **Phase 4 Single Read-Only Adversarial PR Review (Skipped if `merged_tickets.length === 0`):** Dispatch one fresh-context read-only subagent (`research` / `Explore`) on `<base_sha>..HEAD` + approved Task Briefs + `AGENTS.md` + integration freshness; require structured Markdown (`## Review Status`, `## Blockers`, `## Risks`, `## Suggestions`), offering one retry or halt on reviewer `ERROR`/malformed output.
    *   **Gate 2 (`Propose -> Approve -> Apply`):** Present review output (offering pause -> Resume Pointer on `BLOCKERS_FOUND`), integration verification freshness, post-merge `STATE_DRIFT` reconciliation choices (`git revert` + re-verify / keep without closing ref / abort), remote push (skipped for remote-less local repos) & single combined PR to `origin/<default-branch>` (`Closing Rule` dynamically from `merged_tickets`; `custom` multi-key rules `<= 3` in PR title, primary key/slug in branch name, all keys in PR body; manual PR print fallback; never auto-merging), and untriaged `bug`-only out-of-scope proposals (3-field body: Summary, Evidence, Affected Paths; zero `ready:*` or `needs-info` labels).
    *   **Pre-Apply Guards & Execution Receipt:** Apply `CIRCUIT_OPEN` on `401`/`403`/`429`, normalized case-insensitive open-issue title duplicate checks (`SKIPPED (DUPLICATE_EXISTS)`), and branch-free provenance footers (`<YYYY-MM-DDTHH:MM:SSZ>`); emit canonical Markdown Execution Receipt table with outcome tokens (`APPLIED`, `SKIPPED (STATE_DRIFT)`, `SKIPPED (DUPLICATE_EXISTS)`, `SKIPPED (CIRCUIT_OPEN)`, `SKIPPED (UPSTREAM_UNRESOLVED)`, `ERROR`), emitting Resume Pointer JSON only on partial apply/pause.

*   **Phase 1 Checkpoint:** Run `node scripts/validate-repo.mjs --skill-dir skills/go-ahead` (must exit `0`).

### Phase 2: Register Validator Contracts & Automated Tests (Items 5–6)

#### 5. [`scripts/validate-repo.mjs`](../../scripts/validate-repo.mjs) (Modify)

*   **Type / Scope:** Node.js 20+ Repository Validator
*   **Rationale:** Enforces 6-skill registration and security/reliability contract parity across CI.
*   **Proposed Changes:**
    *   Add `'go-ahead'` to `REQUIRED_SKILLS`, `UNTRUSTED_DATA_SKILLS`, `STATE_DRIFT_SKILLS`, `CIRCUIT_OPEN_SKILLS`, and `PROVENANCE_FOOTER_SKILLS`.
    *   Preserve `FORBIDDEN_PATH_REGEX`, `PRESCRIPTIVE_CODING_REGEX`, `DENYLISTED_PLANNER_COMMANDS`, manifest parity, and zero-symlink checks intact.

#### 6. [`scripts/validate-repo.test.mjs`](../../scripts/validate-repo.test.mjs) (Modify)

*   **Type / Scope:** Automated `node:test` Suite
*   **Rationale:** Verifies multi-file `./references/` link checks and contract enforcement for `go-ahead`.
*   **Proposed Changes:**
    *   Extend `createValidSkill` for multi-file `refs` arrays alongside single-`ref` entries; add a `'go-ahead'` fixture referencing `./references/wave-planning.md`, `./references/execution-and-resume.md`, and `./references/review-and-pr.md`.
    *   Verify all 4 contract markers (`<untrusted_ticket_data>`, `STATE_DRIFT`, `CIRCUIT_OPEN`, provenance footer) strip accurately across all `.md` files in `skills/go-ahead/` during negative tests.
    *   Assert missing `skills/go-ahead`, missing/empty `./references/*.md`, forbidden relative paths, and prescriptive coding phrases fail across `SKILL.md` and `references/*.md`.

*   **Phase 2 Checkpoint:** Run `node scripts/validate-repo.mjs && node --test scripts/validate-repo.test.mjs` (must exit `0`).

### Phase 3: Update Toolkit Documentation (Items 7–8)

#### 7. [`README.md`](../../README.md) (Modify)

*   **Type / Scope:** Public Plugin Documentation
*   **Rationale:** Documents `go-ahead` usage, updates Scope Boundary and skill count from 5 to 6, and preserves historical `v0.1.0` verification records.
*   **Proposed Changes:**
    *   Update `Scope Boundary` to include parallel `ready:direct` orchestration, combined PR creation (`Closing Rule`), and one read-only Adversarial PR Review pass while emphasizing unscripted worker coding practices.
    *   Update `## 5-Skill Lifecycle & Planners` to `## 6-Skill Lifecycle & Planners`, add `/kinasr-skills:go-ahead`, update skill counts (`5` -> `6`), conflicting local skill names, and Standalone Antigravity IDE notes (top-1 fallback halt).
    *   Preserve `v0.1.0` (`2026-11-26`, 5 skills) rows in `Verification Status (Planned vs. Executed)` unchanged, noting `go-ahead` live smoke checks await post-implementation execution.

#### 8. [`docs/designs/kinasr-skills.md`](./kinasr-skills.md) (Modify)

*   **Type / Scope:** Toolkit Architecture Design Document
*   **Rationale:** Aligns toolkit Scope Boundary and Non-Goals with `go-ahead` while preserving the original `v0.1.0` record.
*   **Proposed Changes:**
    *   Add a scope-update note in `Overview` and `Non-Goals` referencing [go-ahead.md](./go-ahead.md), narrowing the coding/PR Non-Goal to cover *only* prescriptive worker coding practices, TDD workflows, commit styles, custom PR body templates, and auto-merging rather than execution orchestration, combined PR creation (`Closing Rule`), and one-pass read-only Adversarial PR Review.
    *   Leave historical `v0.1.0` sections (`Status:`, `Risks & Mitigations`, and `## Verification Plan`) intact.

*   **Phase 3 Checkpoint:** Run `node scripts/validate-repo.mjs && node --test scripts/validate-repo.test.mjs` (must exit `0`) and confirm `skills/go-ahead/SKILL.md` stays within `~60–90 lines`.

### Verification Plan

*   **Static & Cross-Platform CI Validation:** Verify Phase 1, Phase 2, and Phase 3 checkpoints locally (`node scripts/validate-repo.mjs`, `node --test scripts/validate-repo.test.mjs`, `node scripts/validate-repo.mjs --skill-dir skills/go-ahead`) and across `ubuntu-latest`, `macos-latest`, and `windows-latest` in `.github/workflows/validate.yml` (Node.js 20+).
*   **Prompt Size & Documentation Audit:** Confirm `skills/go-ahead/SKILL.md` stays within `~60–90 lines`, `.agents/work-tracking.md` remains `Schema: 1`, zero forbidden paths or prescriptive coding phrases appear in `skills/go-ahead/**/*.md`, and historical `v0.1.0` entries in `README.md` and `docs/designs/kinasr-skills.md` remain unmodified.
*   **Post-Implementation Runtime Smoke Checks (Antigravity CLI & Claude Code):**
    1.  Verify plugin discovery (`agy plugin validate --strict` and Claude Code plugin install) loads 6 skills with zero parse errors.
    2.  Run Dry-Run Gate 1 against mixed `ready:direct` tickets (non-maintainer/unverified body and comment, `Blocked by` chain with dropped dependency cascade, open-PR WIP, sensitive path) verifying filtering, Task Brief compilation, and zero local/remote mutations when declined.
    3.  Run an approved multi-wave batch on Antigravity CLI (`Workspace: "share"`) and Claude Code (`isolation: "worktree"`) verifying Wave `k+1` branching from Wave `k` HEAD, single-commit merges, `COLLISION_REQUEUE`, one read-only Adversarial PR Review pass, Gate 2 combined PR creation (`Closing Rule`, zero auto-merge), and an untriaged `bug`-only out-of-scope proposal (`SKIPPED (DUPLICATE_EXISTS)`, provenance footer).
    4.  Simulate an external blocker or retry-cap halt followed by `go-ahead --resume` verifying preserved `integration_branch`, git-grounded `<base_sha>..HEAD` reconciliation, and `STATE_DRIFT` skip handling.
    5.  Verify subagent-less host behavior halts with zero source-code reads and prints the top-ranked unblocked `ready:direct` ticket.

--------------------------------------------------------------------------------

<!-- Provenance: Indicates initial structural drafting via EGM. -->

*Drafted with EGM*
