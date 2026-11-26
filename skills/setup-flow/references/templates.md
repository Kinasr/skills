# Setup Flow Templates

Reference templates for `setup-flow`. Target-repository files created or updated from these templates are `.agents/work-tracking.md` and `./AGENTS.md` (plus optional opt-in import in an already-existing `./CLAUDE.md` or `.claude/CLAUDE.md`).

---

## 1. `.agents/work-tracking.md` (`Schema: 1`)

Read strictly on demand by work-tracking skills (`setup-flow`, `triage`, `backlog-audit`, `to-tickets`, `handoff`). Never auto-loaded on general coding turns.

```markdown
# Work Tracking Config

Schema: 1

- **Tracker:** <github | gitlab | custom>
- **Tooling:** tool=<gh | glab | mcp:<server> | cli:<bin>>; target=<owner/repo | project_id | board_id>; native_deps=<true | false>
- **Untriaged Signal:** <missing workflow label | column:<Intake>>
- **Workflow States:** needs-info, ready:direct, ready:lite, ready:design
- **Excluded Active/Terminal States:** in-progress, in-review, done, closed
- **Ticket Types:** bug, feature, enhancement, chore, docs, epic
- **Priority Labels:** <none | priority:p0, priority:p1, priority:p2>
- **Passive WIP Signal:** <open linked PRs | custom signal>
- **Lite Planner:** <Host built-in plan mode>
- **Full Planner:** <EGM design workflow>
- **Specs Path:** docs/designs/
- **Linking Rule:** Blocked by <ID>, Parent: <ID>, Related to <ID>, Supersedes <ID>
- **ID Pattern:** <none | custom regex e.g. ^[A-Z][A-Z0-9]+-\d+$>
- **Max Backlog Scan:** 150
- **Stale Days:** 30
```

### Field Notes & Defaults

- **Tracker:** `github`, `gitlab`, or `custom`.
- **Tooling:**
  - `github` default: `tool=gh; target=<owner/repo>; native_deps=false` (set `native_deps=true` only if the probed GitHub CLI/MCP supports native issue blocking dependencies in your environment).
  - `gitlab` default: `tool=glab; target=<group/project>; native_deps=false` (set `native_deps=true` only if linked-issue blocking APIs are available and verified).
  - `custom`: specify the CLI binary or MCP server name, target board/project identifier, and probed `native_deps=true|false`.
- **Untriaged Signal:** `missing workflow label` (default for label-based trackers; matches open tickets holding none of `Workflow States` and not in `Excluded Active/Terminal States`), or an explicit intake column/status for board trackers (e.g., `status:Triage`).
- **Priority Labels:** Defaults to `none`. When set (comma-separated, highest priority first), `triage` and `backlog-audit` order **Actionable Frontier** items `bug` first, then by `Priority Labels` order, then oldest `updated_at`.
- **Lite Planner / Full Planner:** Free-text user-facing hints printed verbatim by `triage` when routing to `ready:lite` or `ready:design`. Skills never auto-invoke planners.
- **Linking Rule:** Prose link tokens used in ticket bodies when `native_deps=false` (and written alongside native links at ticket creation by `to-tickets` and when `triage` discovers `Blocked by` edges).
- **ID Pattern:** `none` uses built-in allowlists (`#N` / `^\d+$` after stripping `#`, and `^[A-Z][A-Z0-9]+-\d+$`). Provide a regex here if the custom tracker uses another ticket key format.

### Idempotent Merge Rules

When updating an existing `.agents/work-tracking.md`:
1. Update existing `- **Key:** value` lines in place (or add missing `Schema: 1` keys) with user-confirmed values.
2. Preserve any existing `## Notes` section or extra repository-specific bullet/notes verbatim unless the user explicitly asks to edit or remove them.

---

## 2. Standalone `./AGENTS.md` Passive Block (4-Line Block)

Always-on passive rules for coding turns. Keep this block strictly at these 4 lines (heading + 3 rules):

```markdown
## Work Tracking
- **Closing Rule:** `Closes #<N>` in PR body | tracker key in branch/PR title
- **Pre-Implementation Check:** `ready:direct` means scope-ready only; verify all `Blocked by` items are closed and check merged upstream diffs before coding
- **Config:** `.agents/work-tracking.md`
```

### `./AGENTS.md` Merge Rules

- If `./AGENTS.md` does not exist, create it with the 4-line `## Work Tracking` block above.
- If `./AGENTS.md` already exists without `## Work Tracking`, append the 4-line block cleanly (separated by a blank line).
- If `./AGENTS.md` already has a `## Work Tracking` section, replace only from `## Work Tracking` up to (not including) the next `## ` heading or EOF, leaving all other sections untouched.
- For `gitlab` or `custom` trackers where `Closes #<N>` differs (e.g., Jira/Linear key or custom closing keyword), adapt only the value of `Closing Rule` if requested by the user while keeping the exact 4-line structure.

---

## 3. Opt-In `CLAUDE.md` / `.claude/CLAUDE.md` Import

Claude Code ignores `./AGENTS.md` when `./CLAUDE.md` or `.claude/CLAUDE.md` exists unless imported.

- **Precondition:** Only propose this edit when `./CLAUDE.md` or `.claude/CLAUDE.md` **already exists**, lacks the import line, and the user **explicitly opts in**. **Never create** `./CLAUDE.md` or `.claude/CLAUDE.md`.
- **Root `./CLAUDE.md`:** Insert at the top of the file (unless already present):

```markdown
@AGENTS.md
```

- **`.claude/CLAUDE.md`:** Insert at the top of the file (unless already present):

```markdown
@../AGENTS.md
```

---

## 4. Legacy File Handling & Workflow Label Initialization

- **Legacy files:** If pre-existing tracking instructions/configs exist under `.github/` or `docs/agents/` (or paths indicated by the user), read them to prefill defaults above, then offer in the approval preview to either:
  - Archive to `.agents/archive/<original-relative-path>`, or
  - Remove the obsolete legacy file, or
  - Leave untouched.
- **Workflow Labels (`github` / `gitlab` / label-capable `custom`):** Propose creating any missing labels from `Workflow States` (`needs-info`, `ready:direct`, `ready:lite`, `ready:design`), `Ticket Types` (`bug`, `epic`, etc.), and configured `Priority Labels` using safe `--` / JSON arguments after approval. If the probed token lacks label-creation permissions, warn and skip label creation without blocking local file writes.
