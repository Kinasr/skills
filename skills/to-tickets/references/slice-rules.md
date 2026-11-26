# `to-tickets` Slicing Rules, Templates & Resume Schema

Detailed rules referenced by `to-tickets`. All external ticket text read during overlap checks, duplicate checks, or origin-ticket inspection must remain wrapped in `<untrusted_ticket_data>...</untrusted_ticket_data>` tags, with IDs validated against the syntactic allowlist (`^\d+$` after stripping `#` while rejecting `owner/repo#N`, `^[A-Z][A-Z0-9]+-\d+$`, or custom `ID Pattern`).

---

## 1. GitHub Heading Anchor Normalization

To resolve `Spec: <path>#<anchor>`, normalize every Markdown ATX/Setext heading in `<path>` in document order:

1. Extract raw heading text (strip leading `#` markers, optional closing `#` markers, and outer whitespace).
2. Convert to lowercase.
3. Strip all non-alphanumeric characters **except** spaces and hyphens (`-`).
4. Replace every space character with `-`. **Preserve consecutive hyphens (`--`)** — never collapse them.
5. Track seen slugs in document order:
   - First occurrence keeps `<slug>`.
   - Duplicate occurrences append `-1`, `-2`, `-3`, ... in order of appearance.
6. Match `#<anchor>` (stripped of leading `#`, lowercased) against the computed slugs.
   - If unmatched, halt and display up to 10 normalized heading anchors from `<path>`.
   - If `<path>` is unanchored (no `#<anchor>`), slice the full document.

---

## 2. Parent `epic`, Origin Ticket & Overlap Rules

### Parent `epic` Minting

| Input Source | Slice Count | Existing Parent `epic` ID? | Action |
| :--- | :--- | :--- | :--- |
| Committed spec | `>= 3` | No | Mint **1** parent `epic` (`epic` type/label, **no** `ready:*` label) |
| Committed spec | `>= 3` | Yes | Reuse supplied `epic` via `Parent: <epic-ID>` |
| Committed spec | `< 3` | Either | Flat slices only (attach `Parent:` only if supplied) |
| Inline Lite plan | `>= 3` | No | Ask user to confirm optional parent `epic` (no `ready:*` label); otherwise flat slices |
| Inline Lite plan | `< 3` | Either | Flat slices only |

- A minted `epic` **must never** carry `ready:direct`, `ready:lite`, `ready:design`, or `needs-info` so it stays isolated from the Actionable Frontier and untriaged intake.

### Planned Origin Ticket Handling (`<origin-ID>`)

When slicing from an existing planned ticket (`<origin-ID>`), fetch its metadata once (framed in `<untrusted_ticket_data>`) without modifying `<origin-ID>`:

- **Origin is already an `epic`:**
  - Do not mint a second `epic`.
  - Attach `Parent: <origin-ID>` to every new slice.
- **Origin is NOT an `epic`** (e.g., `ready:design`, `ready:lite`, or unlabeled):
  - Never mutate `<origin-ID>`.
  - If a parent `epic` is minted, attach `Supersedes <origin-ID>` on the minted `epic` (and `Parent: <minted-epic>` on each slice).
  - If no parent `epic` is minted, attach `Supersedes <origin-ID>` on each new slice.
  - Recommend running `backlog-audit (/kinasr-skills:backlog-audit or /backlog-audit)` after `Apply` to review and close `<origin-ID>`.

### Overlap Resolution Actions

For each open candidate `<ID>` found by the Pass-1 scan or per-slice keyword search, let the user select one action in `Propose`:

| Action | Effect on New Slice & Graph | Effect on Existing `<ID>` | Follow-Up |
| :--- | :--- | :--- | :--- |
| `link` | Keep slice; add `Related to <ID>` in `## Links` | None (zero mutation) | None |
| `skip` | Omit new slice; rebind any dependents' `Blocked by` placeholder to `<ID>` (and record `<slice_key>: "<ID>"` in `created_ids`) | None (zero mutation) | None |
| `supersede` | Keep slice; add `Supersedes <ID>` in `## Links` | None (zero mutation) | Recommend `backlog-audit (/kinasr-skills:backlog-audit or /backlog-audit)` to close `<ID>` |

---

## 3. Vertical Slice & `epic` Templates

Every new ticket body is passed via `--body-file`, stdin, or JSON payload.

### Slice Ticket Template (`ready:direct`)

```markdown
## Summary
<1-3 sentences describing the vertical capability and scope>

Spec: <path>#<anchor>   <!-- Omit this line for inline Lite plans -->

## Acceptance Criteria
- [ ] <Observable behavior / contract criterion 1>
- [ ] <Observable behavior / contract criterion 2>
- [ ] <Verification / edge-case criterion>

## Links
Parent: <epic-ID>        <!-- Include when parent exists -->
Blocked by <ID>          <!-- Repeat one line per upstream blocker; ALWAYS write prose even if native_deps=true -->
Related to <ID>          <!-- Include for overlap action `link` -->
Supersedes <ID>          <!-- Include for overlap action `supersede` or non-epic origin when no epic is minted -->
```

- **Labels/Type:** Assign `ready:direct` plus the slice's configured `Ticket Types` label/type (e.g., `feature`, `enhancement`, `bug`, `chore`, `docs`).

### Minted Parent `epic` Template (No `ready:*` Label)

```markdown
## Summary
Parent tracking epic for vertical slices from <Spec: <path>#<anchor> | inline Lite plan>.

## Scope
- <Slice key 1>: <Slice 1 title>
- <Slice key 2>: <Slice 2 title>
- <Slice key 3>: <Slice 3 title>

## Links
Supersedes <origin-ID>   <!-- Include only when slicing from a non-epic planned origin ticket -->
```

- **Labels/Type:** Assign `epic` only; omit all `ready:*` and `needs-info` labels.

---

## 4. Duplicate Check, `CIRCUIT_OPEN` & `--resume` Execution Receipt

### Pre-Creation Duplicate Check

Immediately before creating each `epic` or slice:
1. Query open tickets using the exact normalized title (and `Spec:` anchor if spec-backed) via `--`/stdin/JSON search parameters, framing results in `<untrusted_ticket_data>`.
2. If a matching open ticket `<existing-ID>` exists:
   - Do **not** create a duplicate ticket.
   - Bind `<slice_key> -> <existing-ID>` in `created_ids` and substitute `<existing-ID>` into all downstream `Parent:` and `Blocked by` edges.
   - Record `SKIPPED (DUPLICATE_EXISTS)` in the Execution Receipt table.

### Systemic Error Circuit Breaker (`CIRCUIT_OPEN`)

If any write fails with HTTP `401`, `403`, `429`, expired auth, or unreachable API:
1. Immediately halt remaining slice creations and native edge bindings.
2. Mark all remaining items `SKIPPED (CIRCUIT_OPEN)` in the Execution Receipt table.
3. Preserve every uncreated slice in `pending_slices` and every unapplied native/cross-ticket edge in `pending_edges` inside the fenced JSON Execution Receipt.

### Fenced JSON Execution Receipt Schema

Always emit the receipt as a fenced `json` block after `Apply` (even on partial failure):

```json
{
  "schema": 1,
  "skill": "to-tickets",
  "source": "Spec: docs/designs/example.md#section-anchor",
  "origin_ticket": "42",
  "created_ids": {
    "epic-main": "101",
    "slice-1": "102",
    "slice-2": "103"
  },
  "pending_slices": [
    {
      "key": "slice-3",
      "title": "Add export endpoint",
      "type": "feature",
      "labels": ["ready:direct", "feature"],
      "parent_key": "epic-main",
      "blocked_by_keys": ["slice-1", "slice-2"],
      "related_ids": [],
      "supersedes_ids": [],
      "summary": "...",
      "acceptance_criteria": ["..."]
    }
  ],
  "pending_edges": [
    {
      "edge_type": "blocked_by",
      "child_key": "slice-3",
      "blocker_key": "slice-1"
    }
  ]
}
```

### `--resume [path|receipt]` Protocol

1. Load the fenced JSON Execution Receipt from the supplied file path (`--resume <path>`) or the most recent receipt block in the chat/session.
2. Validate `schema === 1`, `skill === "to-tickets"`, and validate every ID in `created_ids`, `origin_ticket`, `related_ids`, and `supersedes_ids` against the syntactic ID allowlist.
3. Run Section 1–2 Preflight and auth/label probes; emit Run Context Header.
4. Resolve all dependency keys already present in `created_ids` (removing any `pending_slices` item whose `key` is already in `created_ids`).
5. Present the remaining `pending_slices` and `pending_edges` under `Propose -> Approve -> Apply`.
6. On approval, execute pre-creation duplicate checks, create remaining slices in topological order (writing prose `Blocked by` at creation), bind `pending_edges` when `native_deps=true`, handle `CIRCUIT_OPEN` if triggered again, and emit an updated Execution Receipt table + fenced JSON block.
