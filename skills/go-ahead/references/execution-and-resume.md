# `go-ahead` Execution, Security Gates, Wave Integration & `--resume`

Sub-protocol for Phase 3 and `--resume`. Coding workers are strictly local-only and receive only human-approved sanitized Task Briefs plus compact Wave `k-1` merged diff summaries.

---

## 1. Preflight Baseline & Git-Native Common-Dir Snapshot

1. **Integration Branch & Baseline Check:**
   - Create and check out `integration_branch` (`go-ahead/<slug>-<YYYYMMDD>` on `github`/`gitlab`, or `go-ahead/<primary-key>-<slug>-<YYYYMMDD>` on `custom`) from `base_sha`.
   - Record `git rev-parse HEAD` as initial `<pre-wave-sha>`.
   - If Gate 1 confirmed a verification command(s), run it once on `base_sha`:
     - **Pass:** record `VERIFIED_ON_CURRENT_DIFF`.
     - **Fail (`FAILED_ON_CURRENT_DIFF`):** pause and ask the user whether to proceed using the recorded baseline failure signature or abort. When continuing with a failing baseline, Wave Integration Gates reject only *new* regressions relative to that baseline signature and surface `FAILED_ON_CURRENT_DIFF` at Gate 2.
     - **None confirmed:** record `UNVERIFIED`.
2. **4-State Verification Freshness Precedence:**
   - `FAILED_ON_CURRENT_DIFF` > `STALE_PRE_EDIT` > `VERIFIED_ON_CURRENT_DIFF` > `UNVERIFIED` (capturing last `40` lines of output in `log_tail`).
3. **Git-Native Common-Dir Guard Snapshot:**
   - Locate common git dir via `git rev-parse --git-common-dir`.
   - Snapshot `git config --local --list` output and filenames plus byte sizes of all non-`.sample` files under `<git-common-dir>/hooks` (empty list if absent). Avoid platform-specific shell hash binaries.

---

## 2. 2-Tier Worktree Provisioning & Primary-Workspace Rule

1. **Tier 1 — Host-Native Isolation (Preferred):**
   - **Antigravity:** invoke coding workers with `Workspace: "share"` (never `Workspace: "inherit"` for concurrent writers).
   - **Claude Code:** invoke coding workers with `isolation: "worktree"`.
   - **Primary-Workspace Branching Invariant:** Keep `integration_branch` checked out in the primary workspace after each Wave `k` merge. Before launching Wave `k+1`, verify each host-native worktree starts from current post-Wave-`k` `integration_branch` HEAD (if the host branches from an older commit, create local branch `go-ahead-wt/<ticket-id>` at current `integration_branch` HEAD inside the worktree before coding).
2. **Tier 2 — Sequential Fallback (`concurrency = 1`):**
   - If host-native isolated worktrees cannot be provisioned under runtime limits, run one worker at a time:
     1. Create ephemeral branch `go-ahead-wt/<ticket-id>` from current `integration_branch` HEAD (`git checkout -b go-ahead-wt/<ticket-id>`).
     2. Dispatch one worker with its sanitized Task Brief.
     3. Verify `git status --porcelain` is clean before returning to `integration_branch` (after confirming edits are committed on `OK`, clean any leftover untracked build artifacts via `git clean -fd`; if aborted/rejected, run `git reset --hard && git clean -fd`), inspect `<integration-HEAD>..<worker-HEAD>`, check out `integration_branch`, and delete `go-ahead-wt/<ticket-id>` (`git branch -D`) if not merged/retained.
3. **Mandatory Ephemeral Cleanup:** Remove temporary worker worktrees (`git worktree remove` / `git worktree prune`) and `go-ahead-wt/*` branches after each wave settles and on any halt, preserving `integration_branch`.

---

## 3. Local-Only Worker Dispatch & Nullable JSON Envelope

Workers never receive raw `<untrusted_ticket_data>` and never run `git push`, `gh`, `glab`, or remote tracker writes. Workers execute local verification inside their worktree and **must commit all edits onto their isolated branch** before returning:

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

- Normalize malformed/non-JSON worker responses or `OK` returns with zero diff against `integration_branch` HEAD to `ERROR`.
- Missing untracked dependencies present in the primary workspace (such as `node_modules/`, `.venv/`, or `.env`) causing missing-module/environment failures return `ENV_SETUP_REQUIRED` (`0` retries consumed).

---

## 4. Pre-Merge Security Gates, Wave Integration Gate & Retries

Before executing Wave `k` merges, record `<pre-wave-k-sha>` (`git rev-parse HEAD` on `integration_branch`). Process each `OK` worker commit sequentially:

1. **Pre-Merge `STATE_DRIFT` Re-Check:** Re-read live tracker state (`<untrusted_ticket_data>`). If drifted (closed, lost `ready:direct`, entered excluded state, open linked PR WIP appeared, or new unresolved blocker/body change), skip merging as `SKIPPED (STATE_DRIFT)` and cascade `SKIPPED (UPSTREAM_UNRESOLVED)` transitively to downstream dependent waves.
2. **Git-Native Common-Dir Integrity Check:** Compare live `git config --local --list` and non-`.sample` hooks under `<git-common-dir>/hooks` against the Wave 1 snapshot. On any unexpected mismatch, **abort immediately without emitting a Resume Pointer** and instruct the user to inspect `.git/config` and `.git/hooks`.
3. **Segmented Diff Policy (`git diff --name-status --raw <integration-HEAD>..<worker-HEAD>`):**
   - **Hard-Blocked Security Invariants** (matching anywhere in tree/root): `.git/`, `.github/workflows/`, git hooks, `.env*`, git symlink mode `120000`, git submodule mode `160000`, `.agents/`, `AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md`. Unless pre-authorized in Gate 1, abort merge, clean ephemeral worker state, and **halt emitting a Resume Pointer**.
   - **Review-Gated Build/Lock Manifests** (root or nested): `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `Cargo.toml`, `Cargo.lock`, `go.mod`, `go.sum`, `pyproject.toml`, `requirements*.txt`, `Gemfile*`, `Makefile`. If not pre-authorized in Gate 1, quarantine the worker branch and prompt user per diff to approve merge or drop ticket (`SKIPPED (UPSTREAM_UNRESOLVED)` cascade if dropped).
4. **Trial Single-Commit Squash Merge & Collision Requeue:**
   - Run `git merge --squash <worker-head>`:
     - On conflict with an earlier sibling in the same wave, abort (`git reset --merge`, or `git reset --hard HEAD && git clean -fd` if staged) and place the colliding ticket in `COLLISION_REQUEUE` (`0` retries consumed) to execute sequentially (`concurrency = 1`) after existing non-conflicting Wave `k` commits pass the Wave Integration Gate.
     - On clean squash, commit one commit: `git commit -m "<ticket-id>: <sanitized summary>"`.
5. **Wave Integration Gate & Bounded Retries (`<= 3` Attempts):**
   - After all non-conflicting Wave `k` merges land on `integration_branch`, run the Gate 1-confirmed verification command(s) **once** on `integration_branch` HEAD (`FAILED_ON_CURRENT_DIFF` baseline failures permitted only without new failure signatures).
   - Once green, execute any `COLLISION_REQUEUE` tickets sequentially (`concurrency = 1`) against the verified updated `integration_branch` HEAD, merge cleanly, and re-run the Wave Integration Gate.
   - **If any Wave Integration Gate fails:** use cumulative `git bisect` or incremental replay from `<pre-wave-k-sha>` (`commit 1`, `commit 1 + commit 2`, ...) so interaction regressions are caught, reset `integration_branch` excluding the failing commit (`git reset --hard` + replay passing sibling commits), increment that ticket's implementation/test retry counter, and retry it in a fresh isolated worktree from updated `integration_branch` HEAD (with `40`-line failure tail) up to **3 attempts** total per ticket.
   - Generate a compact Wave `k` merged-diff summary for Wave `k+1` once the Wave Integration Gate is green.
6. **Halt Conditions:**
   - Halt immediately on `BLOCKED_EXTERNAL`, `PERMISSION_REQUIRED`, `ENV_SETUP_REQUIRED` (advise dependency setup or `concurrency = 1`), or exhausting `3` implementation/test retries (or persistent `ERROR`). Clean up ephemeral worker worktrees/branches while preserving `integration_branch`, and emit a Resume Pointer JSON.
   - If all waves finish with `merged_tickets.length === 0`, skip Phase 4 and Gate 2 push/PR completely, print the skipped/halted summary (and surface any collected `out_of_scope_bugs` for optional `bug`-only Gate 2 filing or summary if non-empty), and stop.

---

## 5. Git-Grounded `--resume [<integration_branch> | path | json]` Reconciliation

Emit this minimal versioned fenced JSON **Resume Pointer** only on halt, Gate 2 pause (`BLOCKERS_FOUND`), or partial Gate 2 apply:

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

**On `--resume`:**
1. Parse supplied `<integration_branch>`, pointer file path, or inline/session fenced JSON. When JSON/path is provided, require `schema === 1` and `skill === "go-ahead"`, validate all IDs against Section 2 allowlists, and sanitize strings. When only `<integration_branch>` is provided without a pointer, resolve `base_sha` via `git merge-base <default-branch> <integration_branch>` and default `remaining_ticket_ids` to `[]` unless supplied or confirmed.
2. Verify `<integration_branch>` exists locally, `git status --porcelain` is clean, and `<base_sha>` is an ancestor of `<integration_branch>` HEAD, then explicitly check out `<integration_branch>` (`git checkout <integration_branch>`).
3. Derive already-landed tickets from `<base_sha>..HEAD` commit subjects on `<integration_branch>`, excluding any net-reverted tickets (matching `^Revert "<ticket-id>:`).
4. If `origin` exists, `git fetch origin` and check whether `origin/<default-branch>` advanced beyond `base_sha`; warn the user and offer to rebase, continue on `base_sha`, or abort.
5. Re-check live `STATE_DRIFT` on `remaining_ticket_ids` (cascading `SKIPPED (UPSTREAM_UNRESOLVED)` to dependents if drifted).
6. **Re-entry routing:**
   - If `remaining_ticket_ids` is non-empty: re-enter **Gate 1** (`./references/wave-planning.md`), resetting retry counters to `0` and re-confirming any non-maintainer bodies, verification command(s), and Task Briefs before continuing waves.
   - If `remaining_ticket_ids` is empty (e.g., resuming after local `BLOCKERS_FOUND` fixes on `integration_branch`): run the verification command(s) on current `integration_branch` HEAD and re-enter **Phase 4 -> Gate 2** (`./references/review-and-pr.md`).
