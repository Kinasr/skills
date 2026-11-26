# Triage Batch Mode: Topological-Wave Protocol

Loaded by `triage` when invoked with `untriaged` or `2–10` explicit ticket IDs. All rules from `SKILL.md` (`Run Context Header`, `Preflight`, `<untrusted_ticket_data>` framing, syntactic reference-ID allowlists / custom `ID Pattern`, `--`/stdin/`--body-file`/JSON passing, preview sanitization, `Propose -> Approve -> Apply`, `STATE_DRIFT`, `CIRCUIT_OPEN`, provenance footers, Execution Receipt, and zero source-code edits) apply throughout Batch Mode.

---

## 1. Subagent Availability Probe (First Step — Zero Code Reads)

Before reading any repository source files:

1. Probe whether the active host exposes a fresh-context subagent tool (such as `invoke_subagent` in Antigravity CLI or the subagent tool in Claude Code).
2. **If subagents are unavailable** (e.g., Standalone Antigravity IDE or subagent-less host):
   - Perform **zero source code reads**.
   - Select the single highest-priority candidate using either the explicitly provided ticket IDs or **at most 1 metadata-only list fetch** (projecting ID, labels/type, `created_at`, excluded states, and open PR WIP status; wrapped in `<untrusted_ticket_data>`).
   - Rank candidates by existing `bug` type/label first, then oldest `created_at` ascending.
   - Warn the user that batch triage requires fresh-context subagents to avoid multi-ticket context degradation, print the single-ticket `triage` command for the top candidate (harness-neutral, e.g., `run triage #<ID> (/kinasr-skills:triage #<ID> or /triage #<ID>)`), and **halt immediately**.

---

## 2. Batch Cap (`<= 10`) & Single Coordinator Fetch (`4 KB` Cap)

1. **Selection & `<= 10` Cap:**
   - For `untriaged` queries, match open tickets carrying the configured `Untriaged Signal`, **excluding** `needs-info`, `epic` (`Ticket Types`), `Excluded Active/Terminal States` (`in-progress`, `in-review`, `done`, `closed`), and active `Passive WIP Signal` (`open linked PRs`) unless explicitly requested.
   - If `> 10` untriaged tickets match, select up to **10** tickets ordered by:
     1. Existing `bug` type/label first
     2. Oldest `created_at` ascending
   - Report the remaining unpicked count (`Selected 10 of <total> untriaged tickets; <total - 10> remaining`).
   - If more than 10 explicit IDs were passed, ask the user to narrow to `<= 10` (or prioritize the top 10 by `bug`-first then `created_at` ascending on approval).
2. **Single Coordinator Metadata Fetch:**
   - The Coordinator performs **one** bounded fetch covering the selected batch items plus referenced blocker metadata, capping raw body + comment text per item at **`4 KB`**.
   - Wrap all retrieved text in `<untrusted_ticket_data>...</untrusted_ticket_data>` and validate all extracted blocker IDs via the syntactic allowlist (strip single leading `#` before `^\d+$`, reject `owner/repo#N`, allow `^[A-Z][A-Z0-9]+-\d+$` and custom `ID Pattern`).
3. **Out-of-Cap Untriaged Blockers:**
   - If any selected ticket references an open untriaged blocker ID that sits outside the 10-ticket cap, flag that ticket `BLOCKED_BY_UNTRIAGED (<ID>)` and **still dispatch it in Wave 1** with an explicit warning note.
4. **Explicit-ID Conflicts & Exclusions:**
   - If explicitly passed IDs carry `STATE_CONFLICT` (multiple readiness labels), include them and propose normalization in the Dry-Run preview.
   - If explicitly passed IDs are `epic`, in `Excluded Active/Terminal States`, or have active `Passive WIP Signal` (`open linked PRs`), warn and skip them from worker dispatch unless the user explicitly confirms re-triaging them during Preflight.

---

## 3. Topological Graph, SCCs & Cycle Exclusion

1. **Build Intra-Batch Dependency Graph:**
   - Construct directed edges using **`Blocked by` edges only** (`Parent:`, `Related to`, and `Supersedes` add **no** wave ordering).
2. **Detect Strongly Connected Components (SCCs):**
   - Identify cycles (any SCC with `>= 2` nodes or a self-loop).
   - Tag cyclic nodes **`CYCLE_BLOCKED`** and route them to `backlog-audit` (`/kinasr-skills:backlog-audit` or `/backlog-audit`) to resolve the dependency cycle.
   - Tag any acyclic node that transitively depends on a `CYCLE_BLOCKED` node as **`UPSTREAM_UNRESOLVED`** and route it to a follow-up `triage` retry once upstream cycles are resolved.
   - **Exclude** both `CYCLE_BLOCKED` and `UPSTREAM_UNRESOLVED` tickets from subagent dispatch and from `Apply`.
3. **Partition Acyclic Waves:**
   - `Wave 1`: remaining tickets with zero intra-batch `Blocked by` predecessors (including `BLOCKED_BY_UNTRIAGED (<ID>)` items).
   - `Wave k+1`: remaining tickets whose intra-batch `Blocked by` predecessors all belong to waves `<= k`.

---

## 4. Wave Dispatch, Concurrency & Worker Output Envelope

1. **Concurrency & Sequential Fallback:**
   - Dispatch read-only workers per wave with concurrency `min(4, host_limit)` (default `host_limit = 4`).
   - If the host raises a spawn or rate-limit error, fall back to **1-at-a-time isolated fresh-context subagent waves** (never merging multiple tickets into one worker context).
2. **Read-Only Subagent Profile Selection:**
   - **Antigravity (`invoke_subagent`):** use the built-in `research` read-only profile.
   - **Claude Code:** use the built-in `Explore` read-only profile.
   - **Other subagent-capable hosts:** use a general-purpose subagent with explicit prompt-level read-only constraints (defense-in-depth; never edit files or run mutating tracker commands).
3. **Worker Prompt Payload (Inline Context):**
   - Pass inline to each worker:
     - Assigned `ticket_id` and Coordinator-fetched `<untrusted_ticket_data>` (`4 KB` capped).
     - `BLOCKED_BY_UNTRIAGED (<ID>)` warning note if flagged.
     - Applicable Readiness Rubric, `Workflow States`, `Ticket Types`, `Lite Planner` / `Full Planner` hints, and `ID Pattern`.
     - Compact `Wave k` summaries for any intra-batch predecessors (plus any upstream-blocker warning note).
     - Instruction to inspect codebase read-only and output **only** valid JSON matching the envelope below.
4. **Exact Nullable Worker Envelope Schema:**
   ```json
   {
     "ticket_id": "<string>",
     "execution_status": "OK | TIMEOUT | ERROR",
     "inspected_paths": ["<string>"],
     "recommended_state": "needs-info | ready:direct | ready:lite | ready:design | null",
     "type": "<string | null>",
     "blockers": ["<string>"],
     "plan_lines": ["<string>"],
     "questions": ["<string>"],
     "rationale": "<string | null>",
     "error_detail": "<string | null>"
   }
   ```
   - `recommended_state`, `type`, `rationale`, and `error_detail` are nullable (`null` when unused or failed). Array fields (`inspected_paths`, `blockers`, `plan_lines`, `questions`) default to `[]` if empty/omitted on error.
   - Validate any worker-reported `blockers` IDs through the syntactic ID allowlist / custom `ID Pattern`.
5. **Non-JSON & Failure Handling:**
   - If a worker returns non-JSON output, malformed JSON, `TIMEOUT`, or `ERROR`, normalize its status to `execution_status: "ERROR"` and tag the ticket **`UNRESOLVED`** (recording a sanitized truncated `error_detail`).
   - Mark all downstream wave dependents of an `UNRESOLVED` ticket as **`UPSTREAM_UNRESOLVED`** without dispatching them.
   - Exclude both `UNRESOLVED` and `UPSTREAM_UNRESOLVED` tickets from `Apply` and route them to a follow-up `triage` retry.

---

## 5. Cross-Wave Propagation (`Wave k` -> `Wave k+1`)

- After `Wave k` finishes, the Coordinator builds a compact summary for each resolved ticket containing:
  `ticket_id`, `recommended_state`, `type`, `blockers`, and `plan_lines`.
- Pass relevant upstream summaries inline to dependent `Wave k+1` workers.
- **Upstream Warning Without Readiness Capping:** When a `Wave k` blocker resolves to `needs-info` or `ready:design`, attach an explicit **upstream-blocker warning note** to dependent `Wave k+1` items and display it in the Dry-Run preview, **without capping or downgrading** the downstream ticket's independent Triage Readiness (for example, a downstream ticket with clear localized scope remains `ready:direct` alongside its `Blocked by` edge and warning).

---

## 6. Dry-Run Preview, `NEEDS_RECHECK` Cascade, `Apply` & Receipt

1. **Dry-Run Approval Table:**
   - Present a sanitized summary table across all batch tickets (`ticket_id`, sanitized title, wave, `recommended_state` or status tag [`CYCLE_BLOCKED`, `UNRESOLVED`, `UPSTREAM_UNRESOLVED`, `BLOCKED_BY_UNTRIAGED (<ID>)`], `type`, `blockers`, `STATE_CONFLICT` normalization note, upstream-blocker warning note, 3-line plan / questions / verbatim planner hint, and proposed tracker mutations).
2. **Interactive Approval & Transitive `NEEDS_RECHECK` Cascade:**
   - If during review the user overrides an upstream ticket's `recommended_state` or `blockers`, transitively mark all downstream dependents in the batch **`NEEDS_RECHECK`**, exclude them from `Apply`, and recommend re-running `triage` on them.
   - Exclude `CYCLE_BLOCKED`, `UNRESOLVED`, `UPSTREAM_UNRESOLVED`, and `NEEDS_RECHECK` items from `Apply`.
3. **Pre-Apply Re-Verification, `STATE_DRIFT` & `CIRCUIT_OPEN`:**
   - Immediately before mutating each approved ticket in topological order, re-fetch its live state, labels, and body.
   - If the ticket drifted since the Coordinator fetch, skip its writes as **`SKIPPED (STATE_DRIFT)`** and **cascade `NEEDS_RECHECK`** transitively to all unapplied downstream dependents in the batch.
   - Apply approved edits via `--body-file`/stdin/JSON (`native_deps=true` native API + comment, or `native_deps=false` top-of-body append + comment; combined label swap else `add-new -> remove-old`; branch-free provenance footer on comments).
   - If any write encounters systemic auth or rate-limit failures (`401`, `403`, `429`), open the circuit breaker immediately, halt further writes, and mark all remaining unapplied items **`SKIPPED (CIRCUIT_OPEN)`**.
4. **Execution Receipt & Stop:**
   - Emit the Execution Receipt table (`target_id`, `operation`, `outcome`, `url_or_path`, `detail`) covering applied, skipped (`STATE_DRIFT`, `CIRCUIT_OPEN`, `NEEDS_RECHECK`, `UNRESOLVED`, `UPSTREAM_UNRESOLVED`, `CYCLE_BLOCKED`), and next-step routing (`backlog-audit` for `CYCLE_BLOCKED`; `triage` retry for `UNRESOLVED`, `UPSTREAM_UNRESOLVED`, `NEEDS_RECHECK`, `STATE_DRIFT`).
   - Stop cleanly without editing repository source code.
