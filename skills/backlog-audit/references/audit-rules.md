# Backlog Audit Rules & Schemas

Reference specification for `backlog-audit` bounded discovery, prose dependency grammar, anomaly detection, queue classification, and `Propose -> Approve -> Apply` execution.

---

## 1. Bounded Discovery & Truncation Predicates

### 1.1 Pass 1: Open Ticket Scan (`<= Max Backlog Scan`, default `150`)

- **Projected Fields:** Fetch only minimal fields needed for graph and queue analysis:
  `id`, `title`, `state`, `labels` / `type`, `created_at`, `updated_at`.
- **Dependency Extraction by Mode:**
  - When `native_deps=true`: include native `Blocked by` / `Parent` / relation fields from the tracker API, plus a `<= 512`-char body snippet when available.
  - When `native_deps=false`: extract `Blocked by`, `Parent:`, and `Supersedes` lines/edges across the **full body** on the CLI/API/query side *before* truncating body text to a `<= 512`-char preview snippet (for example via `gh api` / `jq` / GraphQL field filtering or MCP projection) so dependency lines near the bottom of an issue body are not silently lost.
- **Query Partitioning vs. Single-Pass Fallback:**
  - Where tracker query filters exist, partition the `Max Backlog Scan` budget across three slices:
    1. Priority / `bug` / `ready:direct` slice
    2. Stale / oldest `updated_at` slice
    3. General open backlog slice (deduplicated by `id`)
  - Where slice filtering is unsupported, query open tickets ordered by `updated_at` ascending up to `Max Backlog Scan` and explicitly disclose that newest-work items beyond the scan cap may be truncated.

### 1.2 Open PR / MR Inspection (`<= Max Backlog Scan`)

- Fetch up to `Max Backlog Scan` open pull requests / merge requests with minimal fields (`id/number`, `title`, `head_branch`, `closingIssuesReferences` or structured linked issue IDs, and `<= 512`-char body lines matching `Closes` / `Fixes` / `Resolves` if closing refs are not natively exposed).
- If the configured CLI/MCP cannot list open PRs/MRs or linked issues, emit an explicit notice (`Open PR inspection: unsupported on current tooling`) and continue without guessing WIP links.

### 1.3 Pass 1.5: Cross-Status Reference Closure (`<= 30` IDs)

- Collect every unique allowlisted ID referenced in Pass 1 (`Blocked by`, `Parent:`, `Supersedes`) or linked by an open PR/MR that was **not** already returned in Pass 1.
- Deduplicate and look up up to **`30`** missing IDs across **all** statuses (open and closed/terminal) using safe CLI/MCP batch or individual queries with `--` / JSON arguments.
- Prioritize open-PR-linked IDs and `Blocked by` targets first if more than `30` missing references exist.
- Mark every reference ID beyond the `30`-ID cap as `UNVERIFIED (REF_CAP_REACHED)`.

### 1.4 Pass 2: Ambiguous Candidate Excerpts (`<= 30` IDs)

- Rank candidate items needing deeper body context (up to **`30`** tickets):
  1. Items with `STATE_CONFLICT`
  2. Items with suspected prose conflicts, `Supersedes` ambiguity, or truncated/unclear dependency lines from Pass 1
  3. Open `epic` candidates with ambiguous child links
- Fetch up to `2 KB` of raw body text per candidate, wrap in `<untrusted_ticket_data>...</untrusted_ticket_data>`, and sanitize previews before display.

### 1.5 Scan Coverage Telemetry & Truncation Safeguards

Always report exact scan coverage at the top of the report:

- Total open count `M` known: `Scanned N of M open tickets`
- Total open count unavailable from tracker: `Scanned N+ open tickets; total unavailable`
- When `N < M`, or pagination hit `Max Backlog Scan` with more pages remaining: append **`TRUNCATED / PARTIAL GRAPH`**.

Mandatory truncation safeguards:

1. **Dangling-ID Suppression:** Never report an unverified reference as a confirmed dangling ID when the graph is `TRUNCATED / PARTIAL GRAPH` or when the ID is tagged `UNVERIFIED (REF_CAP_REACHED)`. Report a dangling ID only after a direct Pass 1.5 lookup confirms the ID does not exist.
2. **Closeable-Epic Verification:** When an open `epic` has `>= 1` known closed child and zero known open children under a `TRUNCATED / PARTIAL GRAPH`, run a targeted child lookup for that epic (within remaining Pass 1.5 / targeted query budget). Only mark it closeable if all children are confirmed closed; otherwise mark it `UNVERIFIED (TRUNCATED_GRAPH)` and do not propose closure.
3. **Filter Prompt:** Whenever `TRUNCATED / PARTIAL GRAPH` is active, prompt the user with scoping filters (`label`, `milestone`, or `assignee`) to run a narrower, untruncated audit.

---

## 2. Prose Dependency Grammar & Signal Separation

### 2.1 Syntactic ID Allowlists

Validate every ID extracted from prose or branch/title text before display or lookup:

- **Default numeric IDs (GitHub / GitLab):** Strip an optional single leading `#` and accept only `^\d+$`. Explicitly **reject** cross-repo forms such as `owner/repo#N` or full cross-repo URLs (log as out-of-scope external ref without querying).
- **Default project-key IDs (Jira / Linear / custom):** Accept `^[A-Z][A-Z0-9]+-\d+$`.
- **Custom `ID Pattern`:** When `.agents/work-tracking.md` defines `ID Pattern`, validate extracted IDs against that exact pattern in place of or alongside the defaults.

### 2.2 Prose Grammar (Outside Fenced Code Blocks)

1. Strip or ignore all lines inside Markdown fenced code blocks (```` ``` ```` or `~~~`, including indented fences).
2. Match dependency directives case-insensitively at line start or after list markers (`-`, `*`), supporting an optional colon (`:?`) and comma- or whitespace-separated allowlisted IDs:
   - `Blocked by:? <ID>[, <ID>...]`
   - `Parent:? <ID>`
   - `Supersedes:? <ID>[, <ID>...]`
3. When `native_deps=true`, compare normalized native edge sets against normalized prose edge sets so identical links do not falsely trigger drift, while mismatches surface under **Native-vs-Prose Drift**.

### 2.3 `CONFIRMED` vs. `SUSPECTED` Signal Separation

| Signal Class | Qualifying Sources | Allowed Actions |
| :--- | :--- | :--- |
| **`CONFIRMED`** | Native tracker blocking/parent edges, `closingIssuesReferences` / structured PR-to-issue links (`Closes #N` in PR body), Pass 1.5-verified issue states, explicit `Blocked by` / `Parent:` / `Supersedes` prose directives matching allowlisted IDs | Drives queue placement, anomaly classification, and `Propose -> Approve -> Apply` fixes |
| **`SUSPECTED`** | PR head branch name key match, PR title keyword/ID match, prose `Related to <ID>`, or ambiguous prose mentions outside structured directives | Surfaced in a separate `Suspected Signals` subsection for human review only; **never** drives automated closure or label swaps |

---

## 3. Anomaly Detection Rules (8 Classes)

1. **Dependency Cycles:**
   - Directed strongly connected components (size `>= 2`, or self-loop `A -> A`) along `CONFIRMED` `Blocked by` edges (`Parent:` and `Related to` do not form blocking cycles).
   - Action: Flag all cycle members and recommend manual cycle-breaking via `Propose -> Approve -> Apply`.
2. **Closed Blockers:**
   - Open ticket with a `CONFIRMED` `Blocked by <ID>` edge whose target `<ID>` is verified in a terminal/closed state (`done` / `closed`).
   - Action: Propose removing the closed blocker reference (native unlink and/or exact body diff).
3. **Verified Dangling IDs:**
   - Syntactically valid `Blocked by`, `Parent:`, or `Supersedes` reference ID that was explicitly queried in Pass 1.5 and confirmed not to exist (404 / empty result).
   - Unqueried IDs due to `REF_CAP_REACHED` or `TRUNCATED_GRAPH` are excluded from this class and listed under Unverified Warnings.
4. **Native-vs-Prose Drift:**
   - Applicable when `native_deps=true`: the set of native `Blocked by` or `Parent` edges differs from the prose `Blocked by:` / `Parent:` edges extracted from the ticket body.
   - Action: Propose `link sync` after asking the user to select the winning source of truth (`native -> prose` or `prose -> native`).
5. **Closeable Epics:**
   - Open ticket typed as `epic` (`Ticket Types`) that has `>= 1` child (`Parent: <epic-ID>` or native sub-issue link) and **all** children are verified closed/terminal.
   - Epics with `0` known children are not flagged closeable. Under `TRUNCATED / PARTIAL GRAPH`, verify child list first or tag `UNVERIFIED (TRUNCATED_GRAPH)`.
6. **Open Superseded Tickets:**
   - Open ticket `<X>` targeted by a `CONFIRMED` `Supersedes <X>` directive from another ticket `<Y>` (open or closed/merged).
   - Action: Propose closing `<X>` with a rationale comment citing `<Y>`.
7. **`STATE_CONFLICT`:**
   - Open ticket carrying `>= 2` mutually exclusive Triage Readiness labels (`needs-info`, `ready:direct`, `ready:lite`, `ready:design`) simultaneously.
   - Action: Propose normalizing to the single appropriate readiness label (or prompt the user to pick the winning readiness state).
8. **Stale Items:**
   - Open ticket whose `updated_at` timestamp is older than `Stale Days` (`30` default) from the current UTC date.
   - **Includes** stalled active items (`in-progress` / `in-review`) past `Stale Days`.
   - **Exempts** open `epic` containers that have at least one open, non-stale child.
   - **Routing:** For items needing code-aware scope/relevance re-evaluation, route to `triage` (`/kinasr-skills:triage` or `/triage`) rather than reading source files in `backlog-audit`.

---

## 4. Queue Classification & Report Structure

### 4.1 Quantitative Health Summary

Display at the top of the report:
- Scan telemetry (`Scanned N of M open tickets` or `Scanned N+ open tickets; total unavailable`, plus `TRUNCATED / PARTIAL GRAPH` and filter prompt if truncated)
- Open PR inspection status (`Checked K open PRs/MRs` or `unsupported`)
- Counts by queue: Actionable Frontier, Active WIP, Blocked Queue, `needs-info`, Planning (`ready:lite` / `ready:design`), Untriaged, Epics, Open Superseded
- Counts by anomaly class (`CONFIRMED`, `SUSPECTED`, `UNVERIFIED (REF_CAP_REACHED)`, `UNVERIFIED (TRUNCATED_GRAPH)`)

### 4.2 Queue Predicates & Ordering

| Queue | Inclusion Predicate | Ordering & Badges |
| :--- | :--- | :--- |
| **Actionable Frontier** | Open ticket with `ready:direct`, **not** in `Excluded Active/Terminal States`, **not** `epic`, zero open or unverified `Blocked by` edges, and zero `CONFIRMED` open linked PRs | `bug` type first, then configured `Priority Labels` order (when not `none`), then oldest `updated_at` ascending |
| **Active WIP (Open PR / In-Progress)** | Open ticket with a `CONFIRMED` open linked PR/MR **or** in an active excluded state (`in-progress`, `in-review`) | List `CONFIRMED` WIP items with PR/state details and `[STALE]` flag if past `Stale Days`; list `SUSPECTED` PR matches separately |
| **Blocked Queue** | Open ticket with `>= 1` open or `UNVERIFIED` `Blocked by` edge | List blocking IDs + status; attach **`WIP`** badge if the item also has an open linked PR or active `in-progress`/`in-review` state |
| **Secondary Queues** | `needs-info`, `ready:lite`, `ready:design`, untriaged items, open `epic` containers, open superseded tickets | Group compactly by queue; highlight `STATE_CONFLICT` and anomalies |

---

## 5. Fix Proposals, Apply Ordering & Provenance Schemas

### 5.1 Concrete Fix Proposal Templates

- **`STATE_CONFLICT`:** Normalize labels -> keep user-confirmed readiness label, remove conflicting readiness label(s).
- **`link sync` (Drift):** Prompt user to select winner (`native -> prose` or `prose -> native`); preview exact native link add/remove or exact body line diff.
- **`closed blockers`:** Remove closed `<blocker-ID>` from native blocking links and/or prose `Blocked by` line via exact previewed diff.
- **`stale`:** Propose a non-destructive ping/re-triage comment (recommending `triage` for code-level re-evaluation); close only if the user explicitly asks to close.
- **`open superseded` / Closeable `epic`:** Propose `comment -> close` with explicit rationale citing the superseding ticket `<Y>` or verified closed children.

### 5.2 Fail-Safe Apply Protocol

1. **Pre-Apply State Re-Verification:** Immediately before writing each approved item, re-fetch its current state, labels, and body/links. If any mutated target changed since the approval preview, record **`SKIPPED (STATE_DRIFT)`** and skip it for re-proposal.
2. **Mutation Ordering:**
   - **Label swaps:** Use a single atomic add+remove call if supported; otherwise execute `add-new -> remove-old` so an item never loses all readiness labels mid-flight.
   - **Closures:** Execute `comment -> close` strictly in order so the rationale comment and provenance footer land before closure.
   - **Argument safety:** Pass every ID, title, body, and comment via `--`, `stdin`, `--body-file`, or JSON API payload.
3. **Circuit Breaker:** If any write fails with systemic auth or rate-limit errors (`401`, `403`, `429`), stop executing remaining writes immediately and mark all unattempted items **`SKIPPED (CIRCUIT_OPEN)`**.

### 5.3 Branch-Free Provenance Footer

Append a single provenance line at the end of every remote ticket comment posted by `backlog-audit` (`short-sha` from `git rev-parse --short HEAD`, or `no-sha` on unborn/non-git workspaces; never include branch names):

- **Markdown-capable trackers (GitHub, GitLab):**
  `<!-- kinasr-skills: backlog-audit | <YYYY-MM-DDTHH:MM:SSZ> | <short-sha|no-sha> -->`
- **Rich-text / non-HTML trackers (Jira ADF, Linear, etc.):**
  `[kinasr-skills: backlog-audit | <YYYY-MM-DDTHH:MM:SSZ> | <short-sha|no-sha>]`

### 5.4 Execution Receipt Schema

Emit after any approved `Apply` run (omit on read-only runs with zero approved writes):

| target_id | operation | outcome | URL / path | error / resume detail |
| :--- | :--- | :--- | :--- | :--- |
| `#42` | `comment -> close (superseded)` | `APPLIED` / `SKIPPED (STATE_DRIFT)` / `SKIPPED (CIRCUIT_OPEN)` / `ERROR` | `<issue-url>` | `-` or error / drift reason |
