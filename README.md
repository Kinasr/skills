# Kinasr Skills (`kinasr-skills`)

Work-orchestration and session-hygiene skills around AI coding agents and external planners.

## Scope Boundary

`kinasr-skills` coordinates repository work-tracking setup, ticket triage, single-repo backlog dependency auditing, post-plan ticket slicing, parallel `ready:direct` wave execution across isolated worktrees (with one fresh-context read-only Adversarial PR Review pass and single combined `Closing Rule` PR creation), and git-grounded session handoffs **without** controlling worker code implementation. Worker coding practices, TDD workflows, debugging, commit-message styles, custom PR body formatting templates, and PR merging remain unscripted/manual for the host coding agent and user.

- **Zero symlinks:** Self-contained `skills/<name>/` directories compatible with macOS, Linux, and Windows checkouts as well as standalone directory copies.
- **Explicit user control:** All six skills declare `disable-model-invocation: true`, never auto-invoke each other, and enforce `Propose -> Approve -> Apply` with execution receipts on mutating writes.

---

## 6-Skill Lifecycle & Planners

| Skill | Purpose |
| --- | --- |
| `setup-flow` | Initialize or idempotently update `.agents/work-tracking.md`, the 4-line passive `./AGENTS.md` block, opt-in `CLAUDE.md` pointers, and workflow labels. |
| `triage` | Classify 1 ticket or a bounded batch (`<=10` tickets in topological waves) into `needs-info`, `ready:direct` (with a 3-line plan), `ready:lite`, or `ready:design`, recording `Blocked by` edges. |
| `backlog-audit` | Run a bounded single-repo dependency graph, open PR/WIP, conflict, and staleness audit without deep code reads; separates **Actionable Frontier**, **Active WIP (Open PR / In-Progress)**, and **Blocked Queue**. |
| `to-tickets` | Slice a finished design spec or inline Lite plan into vertical `ready:direct` tickets in topological order without mutating existing tickets (supports `--resume`). |
| `go-ahead` | *(Optional)* Orchestrate unblocked `ready:direct` ticket waves across isolated worktrees, run one read-only Adversarial PR Review pass, open one combined PR (`Closing Rule`, never auto-merging), and propose untriaged `bug`-only out-of-scope issues (supports `--resume`). |
| `handoff` | Print a git-grounded session handoff snapshot directly to chat first, and optionally preview a `[REDACTED]` secret-scrubbed remote ticket comment for approval before posting. |

### Pairing with Planners

By default, `kinasr-skills` pairs smoothly with [EGM (Elephant-Goldfish Model)](https://github.com/google/elephant-goldfish-model) for full design (`ready:design`) and your host's built-in plan mode for light design (`ready:lite`). You can swap `Lite Planner` and `Full Planner` in `.agents/work-tracking.md` to any free-text workflow hint—`triage` prints those configured hints verbatim and never hardcodes or auto-invokes planner slash commands.

---

## Harness Support, Installation, Upgrades & Invocation

### Verification Status (Planned vs. Executed)

| Target | Status | Post-Release Plan | Notes |
| --- | --- | --- | --- |
| **Antigravity CLI (`agy`)** | Executed (`2026-11-26`, `v0.1.0`) — see [#6](https://github.com/Kinasr/skills/issues/6) | Maintained | Verified clean `agy plugin install`, `agy plugin validate --strict` (5 skills, 0 errors), and live GitHub (`gh`) smoke checks across all 5 skills including `invoke_subagent` wave `triage` (`glab` skipped — not installed). |
| **Antigravity App** | Unverified (manual copy) | Maintained | Interactive command forms remain unverified until tested. |
| **Antigravity for IDEs / Standalone IDE** | Unverified interactive command forms | — | Standalone Antigravity IDE lacks `invoke_subagent`; batch `triage` warns, names the top-priority single-ticket command, and halts; `go-ahead` names the top-ranked unblocked `ready:direct` ticket and halts. |
| **Claude Code** | Executed (`2026-11-26`, `v0.1.0`) — see [#8](https://github.com/Kinasr/skills/issues/8) | Maintained | Verified `claude plugin marketplace add Kinasr/skills && claude plugin install kinasr-skills@kinasr-skills` (Claude Code `2.1.323`, 5 skills, 0 parse errors) and live GitHub (`gh`) Dry-Run + approved `Apply` smoke checks across all 5 skills, including opt-in `CLAUDE.md` `@AGENTS.md` imports and `Explore` subagent `triage`. |
| **Codex CLI, Cursor, generic `skills/`** | Deferred to [#2](https://github.com/Kinasr/skills/issues/2) | Tracked in [#2](https://github.com/Kinasr/skills/issues/2) | `npx skills add Kinasr/skills --list` discovery verified (`2026-11-27`, `6` skills); full multi-harness packaging and runtime checks remain tracked in [#2](https://github.com/Kinasr/skills/issues/2). |

*(Built-in local Markdown file tracking is also deferred to [#1](https://github.com/Kinasr/skills/issues/1). Release `v0.2.0` adds `go-ahead` ([design spec](docs/designs/go-ahead.md)) with cross-OS CI validation passing across 6 skills; live runtime smoke checks for `go-ahead` on Antigravity CLI and Claude Code are pending post-release execution.)*

### Installation & Invocation

#### Antigravity CLI (`agy`)

```sh
agy plugin install https://github.com/Kinasr/skills
```

Invoke skills manually using `/kinasr-skills:<skill>` (for example: `/kinasr-skills:setup-flow`, `/kinasr-skills:triage`, `/kinasr-skills:backlog-audit`, `/kinasr-skills:to-tickets`, `/kinasr-skills:go-ahead`, `/kinasr-skills:handoff`).

#### Antigravity App (Manual Folder Copy)

Copy `plugin.json`, `README.md`, `LICENSE`, and `skills/` into your local Antigravity plugins directory:

- **macOS / Linux:** `~/.gemini/config/plugins/kinasr-skills/`
- **Windows:** `%USERPROFILE%\.gemini\config\plugins\kinasr-skills\`

> **Note:** Standalone Antigravity IDE lacks `invoke_subagent` (so batch `triage` halts with a single-ticket fallback notice, and `go-ahead` halts with a top-1 `ready:direct` fallback notice), and interactive command forms in both Antigravity App and the Antigravity for IDEs extension remain unverified until tested.

#### Claude Code

```sh
claude plugin marketplace add Kinasr/skills && claude plugin install kinasr-skills@kinasr-skills
```

Invoke skills manually using `/kinasr-skills:<skill>`.

#### Generic / Standalone (`npx skills`)

Each skill directory (`skills/<name>/`) is self-contained and discoverable via the open Agent Skills CLI (`npx skills`):

```sh
# List discovered skills without installing
npx skills add Kinasr/skills --list

# Install all 6 skills interactively (choose target agents and scope)
npx skills add Kinasr/skills

# Install all 6 skills globally without prompts
npx skills add Kinasr/skills -g -y

# Install a single skill (for example, go-ahead)
npx skills add Kinasr/skills --skill go-ahead
```

> **Note:** Do not combine `npx skills` standalone installs with `agy plugin install` or `claude plugin install` on the same harness, or bare skill names will collide.

### Manual Upgrades & Conflicting Local Skills

- **Manual directory upgrades:** Before copying an updated release into `~/.gemini/config/plugins/kinasr-skills/` (or `%USERPROFILE%\.gemini\config\plugins\kinasr-skills\`), **delete the existing plugin directory first** so obsolete files do not remain behind.
- **Conflicting standalone local skills:** Because this plugin uses bare skill names (`setup-flow`, `triage`, `backlog-audit`, `to-tickets`, `go-ahead`, `handoff`), back up or remove any conflicting pre-existing standalone local skills (such as `~/.gemini/config/skills/triage/` or `~/.claude/skills/triage/`) to prevent shadowing or command collisions.

---

## Repository Configuration

To avoid loading tracker schemas on every coding turn, configuration is split between a compact always-on block in `./AGENTS.md` and an on-demand file in `.agents/work-tracking.md`.

### Always-On Passive Rules (`./AGENTS.md`)

A standalone 4-line block (heading plus 3 rules):

```markdown
## Work Tracking
- **Closing Rule:** `Closes #<N>` in PR body | tracker key in branch/PR title
- **Pre-Implementation Check:** `ready:direct` means scope-ready only; verify all `Blocked by` items are closed and check merged upstream diffs before coding
- **Config:** `.agents/work-tracking.md`
```

### Opt-In `CLAUDE.md` Pointer

Claude Code ignores `AGENTS.md` whenever `CLAUDE.md` exists unless explicitly imported. During onboarding, `setup-flow` probes for existing `./CLAUDE.md` and `.claude/CLAUDE.md` files—and **only when one already exists and you opt in**—proposes prepending `@AGENTS.md` (in `./CLAUDE.md`) or `@../AGENTS.md` (in `.claude/CLAUDE.md`) without creating a new `CLAUDE.md`.

### On-Demand Skill Configuration (`.agents/work-tracking.md`)

Read strictly on demand by the 6 skills (`Schema: 1`):

```markdown
# Work Tracking Config

Schema: 1

- **Tracker:** github
- **Tooling:** tool=gh; target=owner/repo; native_deps=false
- **Untriaged Signal:** missing workflow label
- **Workflow States:** needs-info, ready:direct, ready:lite, ready:design
- **Excluded Active/Terminal States:** in-progress, in-review, done, closed
- **Ticket Types:** bug, feature, enhancement, chore, docs, epic
- **Priority Labels:** none
- **Passive WIP Signal:** open linked PRs
- **Lite Planner:** host built-in plan mode
- **Full Planner:** Elephant-Goldfish Model (EGM)
- **Specs Path:** docs/designs/
- **Linking Rule:** Blocked by <ID>, Parent: <ID>, Related to <ID>, Supersedes <ID>
- **Max Backlog Scan:** 150
- **Stale Days:** 30
```

*(Optional `- **ID Pattern:** ...` can be added for custom tracker keys.)*

### Zero-Config Fallback (`gh` / `glab`)

When `.agents/work-tracking.md` is absent, skills inspect `git remote -v` and authenticated `gh`/`glab` CLIs:

- If multiple GitHub or GitLab remotes exist (e.g., `origin` and `upstream`), the skill prompts you to disambiguate before continuing.
- On a matched repository, standard defaults are inferred (`native_deps=false` unless native blocking queries probe available, `Excluded Active/Terminal States` `in-progress, in-review, done, closed`, `epic` exclusion from the Actionable Frontier, `Passive WIP Signal` `open linked PRs`, `needs-info`/`ready:*` workflow labels, and `docs/designs/`), and target-repo workflow labels are probed during Preflight.
- If neither `.agents/work-tracking.md` nor a remote matches, tracking skills halt and instruct you to run `setup-flow`—except `handoff`, which runs local-only without a tracker.

---

## Local Validation

Requires **Node.js 20+** (zero external npm dependencies). Run the repository validator and test suite locally:

```sh
node scripts/validate-repo.mjs && node --test scripts/validate-repo.test.mjs
```

Automated CI runs both commands across `ubuntu-latest`, `macos-latest`, and `windows-latest` on every push and pull request.

---

## License

MIT License — see [LICENSE](LICENSE) (`Copyright (c) 2026 kinasr`).
