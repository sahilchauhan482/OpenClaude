# OpenClaude x ECC Feature Harvest

## Purpose

This note captures the strongest ideas worth borrowing from [`affaan-m/ECC`](https://github.com/affaan-m/ECC) without turning OpenClaude into a clone.

ECC is strongest where it behaves like an operator layer around agent harnesses:

- harness-agnostic skills and rules
- operator readiness / doctor / status surfaces
- work item tracking and orchestration visibility
- research-first and security-first reusable skill packs
- audit / repair / observability helper scripts

OpenClaude already has a stronger native harness split than ECC:

- `openclaude-cli` as the backend brain
- `openclaude-vscode` as the UX layer

So the best move is selective adoption, not wholesale migration.

## External Signals

ECC describes itself as an agent operating layer for multiple harnesses and ships a large library of skills, hooks, commands, and operator scripts:

- Repo: https://github.com/affaan-m/ECC
- README: https://github.com/affaan-m/ECC/blob/main/README.md
- Releases: https://github.com/affaan-m/ECC/releases

Useful signals from the repository and package metadata:

- harness-native packaging across Codex, Claude Code, Cursor, Gemini, OpenCode, and others
- a very large public skill catalog
- operator commands like status, work-items, doctor, repair, session-inspect, orchestration-status, and observability-readiness

## What OpenClaude Already Has

OpenClaude already covers a lot of ECC territory natively:

- hooks and policy engine foundations
- verifier / reviewer specialist foundations
- structured clarification UI
- session resume and compaction
- provider readiness and doctor flows
- richer transcript rendering than a pure terminal-only system
- plugin, MCP, and policy-pack surfaces

That means ECC should mostly influence:

- stronger operations UX
- stronger reusable skill packs
- better orchestration visibility
- better readiness / audit / repair workflows

## Best Features To Harvest

### 1. Operator Status Surface

Borrow:

- `ecc status --exit-code`
- orchestration status summaries
- readiness-oriented health output

OpenClaude gap:

- we have doctor and diagnostics, but not one compact "agent operating status" surface that answers:
  - is the workspace healthy?
  - is provider config healthy?
  - are hooks / policy packs active?
  - are verifier / reviewer rails active?
  - are agent-team features in a safe state?

Adoption:

- add an `openclaude status` command
- emit structured readiness categories
- later surface the same status in VS Code as a compact dashboard card

Roadmap fit:

- Phase 2 productization
- Phase 5 transcript / UX quality
- Phase 9 observability and trust

### 2. Work Item / Queue Awareness

Borrow:

- ECC `work-items` style task queue discipline
- external queue sync patterns

OpenClaude gap:

- we have todos, agent-team board, and session summaries
- but we do not yet have a first-class shared "work item state" model that can feed:
  - delegation
  - verification
  - session summary
  - future GitHub / issue sync

Adoption:

- introduce a normalized work-item model above todos
- support states like `queued`, `in_progress`, `blocked`, `verifying`, `done`
- let agent team board consume the same model

Roadmap fit:

- Phase 4 specialist orchestration
- Phase 8 multi-agent teams
- Phase 9 eval / observability

### 3. Repair / Recovery Operations

Borrow:

- ECC `repair` and audit mindset
- harness audit / platform audit / session inspect patterns

OpenClaude gap:

- CLI recovery inside a turn is improving
- but post-failure operator tooling is still fragmented

Adoption:

- add a lightweight session inspection command for:
  - repeated tool failures
  - retry history
  - verifier verdict history
  - last known active policy packs
  - active provider / model / permissions mode
- optionally suggest repair actions from those findings

Roadmap fit:

- Phase 1 self-healing
- Phase 9 trust and observability

### 4. Reusable Skill Packs

Borrow:

- ECC's breadth of focused skills:
  - security review
  - verification loop
  - search-first / research-first
  - workspace surface audit
  - frontend polish
  - testing discipline

OpenClaude gap:

- we have strong harness behavior, but our built-in reusable skills are still less broad and less curated

Adoption:

- do not import ECC blindly
- instead create curated OpenClaude-native skill packs inspired by these categories:
  - `security-review-plus`
  - `verification-loop-plus`
  - `workspace-surface-audit`
  - `research-first-coding`
  - `frontend-premium-ux`

Roadmap fit:

- Phase 2 hooks / policy
- Phase 4 specialists
- Phase 7 dynamic capability discovery

### 5. Observability Readiness

Borrow:

- ECC's observability / readiness mindset

OpenClaude gap:

- event logging exists
- eval fixture support exists
- but user-facing visibility of "what is instrumented and what is missing" is still weak

Adoption:

- add a structured "observability completeness" report
- report whether a session captured:
  - retries
  - verifier events
  - reviewer findings
  - file edit counters
  - agent-team activity
  - compaction boundaries

Roadmap fit:

- Phase 9 directly

## Features We Should Not Copy Directly

### Massive skill quantity

ECC's huge skill volume is useful as inspiration, but importing a large raw set would:

- bloat maintenance
- reduce consistency
- create overlapping / conflicting behaviors

We should prefer a smaller, higher-trust curated set.

### Harness-agnostic abstractions for their own sake

ECC needs to support many external harnesses.
OpenClaude does not.

We should only adopt abstractions that improve our own CLI + VS Code contract.

### Script sprawl without product integration

ECC has many operator scripts.
OpenClaude should convert only the best of those ideas into:

- native CLI commands
- structured events
- VS Code UI surfaces
- tests

## Priority Order For Adoption

### Highest value now

1. `openclaude status` readiness command
2. session inspection / recovery audit
3. stronger normalized work-item model

### Medium value next

4. curated OpenClaude-native skill packs inspired by ECC
5. observability completeness report in UI + CLI

### Later

6. optional external queue sync
7. broader operator dashboards

## Recommended First Implementation Slice

If we start harvesting ECC ideas immediately, the best first slice is:

1. add `openclaude status`
2. summarize:
   - provider readiness
   - doctor status
   - hooks / policy packs
   - verifier / reviewer availability
   - agent-team mode
   - session resume availability
3. return non-zero exit code when blocking readiness issues exist

This gives OpenClaude an operator-grade control surface similar to ECC's strongest practical value, while fitting our architecture cleanly.

## Implemented Skill Harvest

OpenClaude now ships a curated first batch of bundled power skills inspired by the reusable skill-pack category above:

- `research-first-coding`
- `security-review-plus`
- `verification-loop-plus`
- `workspace-surface-audit`
- `frontend-premium-ux`

These are OpenClaude-native prompts registered through the bundled skill system, not copied ECC content. They focus on evidence-first coding, severity-ranked security review, adaptive verification, repository surface mapping, and premium chat/frontend UX.

## Decision

ECC is worth harvesting for:

- operator readiness
- work-item orchestration
- repair / audit tooling
- curated skill-pack ideas
- observability discipline

ECC is not worth copying wholesale.

OpenClaude should adopt the operating patterns, not the sprawl.
