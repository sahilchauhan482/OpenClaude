# OpenClaude Monster Roadmap

## Purpose

OpenClaude should not become a copy of any single coding agent.

The goal is to combine the strongest ideas from the best agentic tools and turn them into one reliable system:

- Codex for harness quality, bounded autonomy, and strong execution flow
- Claude Code for instruction layering, hooks, worktrees, and delegation patterns
- Aider for repo awareness and editing efficiency
- OpenHands for agent platform thinking, GUI plus CLI coverage, and eval mindset
- Goose for dynamic extensions, skills, and session-level capability management

This document is the product blueprint for that direction.

## Current Architecture

OpenClaude already has a healthy split:

- `openclaude-cli`: the agent harness, tool loop, provider routing, slash commands, and execution logic
- `openclaude-vscode`: the host UI, session browser, tool visualization, settings, and editor integration

That means:

- the CLI is the real backend brain
- the VS Code extension is the presentation and orchestration layer
- if we want smarter autonomous behavior, most of that belongs in `openclaude-cli`
- if we want a premium user feel, most of that belongs in `openclaude-vscode`

## Product Rules

1. Do not blindly clone Codex, Claude Code, or any other tool.
2. Adopt only the strongest pattern in each category.
3. Prefer bounded autonomy over infinite retries.
4. Every recovery path must become more informed than the previous failed attempt.
5. UI should expose what the agent is doing without flooding the user with noise.
6. When the agent is uncertain about intent, it should ask with structured choices and a recommended option.
7. Every major capability should be verifiable by tests or evals.

## What We Already Improved

These are already moving in the right direction:

- parent repo workspace layout created around `D:\OpenClaude`
- session resume logic fixed so existing conversations continue correctly
- richer tool cards, file edit cards, live tool status, and diff-style presentation work
- elicitation-style decision UI added so the agent can ask for structured choices
- duplicate "thinking" noise reduced in the webview
- smarter repeated tool failure handling started in `openclaude-cli`
- smaller-model execution-discipline rails added so mini/flash/haiku-class models behave more reliably on agentic tasks
- recovery/adaptation messaging is being surfaced more clearly in the VS Code UI

The newest CLI change is important:

- repeated tool failure no longer hard-stops immediately
- the harness now gets one bounded recovery attempt with a hidden "use a different strategy" nudge
- if the second attempt still loops, it stops with a more useful recovery hint

That is the correct foundation. Next we need to deepen it.

## Execution Status

This roadmap is now also the implementation tracker.

### Implemented now

- Phase 1 foundation:
  - bounded repeated-tool-failure recovery
  - first-pass smarter recovery hints
  - smaller-model execution discipline
  - expanded recovery categorization for not-found, permission, auth, rate-limit, and network classes
- Phase 5 foundation:
  - better tool cards and file edit visibility
  - reduced duplicate thinking noise
  - richer recovery/adaptation system messaging in the webview
- Phase 6 foundation:
  - structured elicitation UI with recommended choices
- Phase 2 first completion slice:
  - built-in `hookPolicyPacks` setting added
  - reusable lifecycle guardrail bundles now available:
    - `safe-default`
    - `codebase-strict`
    - `auto-format-and-test`
    - `enterprise-audit`
  - these packs materialize into native hooks without requiring users to hand-author every hook

### In progress

- Phase 1 deeper recovery planner:
  - command/workspace-aware alternate strategy suggestions
  - stronger monorepo/node_modules/script discovery
- Phase 3 repo intelligence / repo map:
  - lightweight workspace manifest summary now injected into the CLI prompt
  - lightweight repo map now surfaces likely child packages, important directories, and config files
  - lightweight code-surface extraction now highlights likely entry files, hooks, components, and exported APIs
  - root/package scripts and monorepo workspace counts now inform command selection
  - next slice: stronger symbol ranking and task-aware relevance scoring
- Phase 4 verifier and reviewer specialists:
  - verification agent output now has structured verdict parsing
  - completed verifier runs now carry machine-readable PASS/FAIL/PARTIAL metadata
  - verification agent is treated as a one-shot built-in result path
  - verifier verdicts now inject completion-gate guidance back to the parent agent
  - final-summary path now blocks unsupported completion when the latest verification is FAIL, PARTIAL, or weak-evidence PASS
  - built-in reviewer specialist now enforces severity-ranked findings-first review output
  - next slice: richer structured UI/event contracts for reviewer + verifier outputs
- Phase 5 transcript quality:
  - clearer live execution and recovery timeline
  - verifier verdict badges now surface PASS/FAIL/PARTIAL directly in the VS Code tool cards
- Phase 2 deeper productization:
  - expose policy packs more clearly in hook browsing/setup UX
  - add more deterministic command/http/agent templates per pack
- Cross-phase verification:
  - mandatory testing strategy documented in `docs/OPENCLAUDE_MONSTER_TEST_STRATEGY.md`
  - roadmap work should now ship with behavior tests, integration coverage, and explicit verification reporting

### Not started yet

- Phase 7 dynamic extension recommendations
- Phase 8 multi-agent teams and worktrees
- Phase 9 eval packs and observability suite

## Feature Harvest Matrix

| Category | Best external pattern | Why it matters | OpenClaude adoption |
| --- | --- | --- | --- |
| Agent loop | Codex | Strong local harness design, prompt layering, bounded tool loop | Keep CLI as the single agent harness and harden transitions, recovery, and state tracking |
| Instruction hierarchy | Claude Code + Codex | Project-scoped agent instructions are powerful and composable | Support layered project rules, scoped instructions, and path-aware guidance |
| Hooks and policy | Claude Code | Deterministic automation around lifecycle events | Add pre-tool, post-tool, stop-failure, and verification hooks with policy presets |
| Repo context | Aider | Repo map gives broad awareness without stuffing full files | Build a symbol-aware repo map and relevance-ranked context injection |
| Smart recovery | Codex-style harness plus our additions | Agents should adapt after failure, not just stop | Expand recovery planner beyond bash/path errors into env, auth, and dependency classes |
| Extension intelligence | Goose | Dynamic extension enablement reduces manual setup | Recommend and enable MCP/plugins per task, with session-scoped activation |
| Agent platform | OpenHands | CLI, GUI, SDK, eval, and multi-agent thinking under one umbrella | Treat OpenClaude as a platform, not only a chat panel |
| Subagents | Claude Code + Goose + OpenHands | Context isolation and specialist roles improve quality | Add reviewer, researcher, tester, and debugger specialists |
| Verification loop | OpenHands + Codex | Agents need explicit checking, not hope-based completion | Add verifier passes before declaring success |
| UX clarity | Codex + Claude Code | Tool state, progress, and edits must feel obvious | Build a denser, more trustworthy transcript and live execution timeline |

## Architecture Strategy

### 1. CLI owns behavior

Anything related to these belongs first in `openclaude-cli`:

- retry decisions
- failure classification
- alternative strategy generation
- repo awareness
- subagent orchestration
- verification passes
- tool policy and hooks
- eval instrumentation

### 2. VS Code owns experience

Anything related to these belongs first in `openclaude-vscode`:

- tool timelines
- diff visual quality
- command rendering
- live progress summaries
- structured clarification cards
- recovery visibility
- plugin/extension recommendation UI
- session compare, fork, restore, and audit views

### 3. Shared contract must become richer

The CLI and extension should communicate more structured events, not only plain transcript blocks.

We should introduce richer event types for:

- tool-started
- tool-progress
- tool-recovered
- tool-retry-planned
- verifier-started
- verifier-passed
- verifier-failed
- subagent-started
- subagent-finished
- extension-recommended
- extension-enabled

## Phased Roadmap

## Phase 1: Self-Healing Execution

Primary repo: `openclaude-cli`

Goal:
Make the agent recover intelligently when a tool path, binary, workspace layout, or command assumption is wrong.

Build:

- expand failure classification beyond `NotFound`
- detect common categories:
  - wrong working directory
  - missing binary
  - module resolution mismatch
  - permissions mismatch
  - auth/config missing
  - flaky network
  - test runner path mismatch
- generate strategy-specific recovery hints
- add "attempt delta" checks so the second attempt must be materially different
- add safe fallback heuristics:
  - locate binary in parent workspace
  - inspect `package.json` scripts before retrying
  - check `node_modules` locations in monorepos
  - switch from generic runner to direct node entrypoint when needed

Definition of done:

- fewer false hard-stops
- second attempt is observably smarter
- no infinite retry loops

## Phase 2: Hook and Policy Engine

Primary repo: `openclaude-cli`

Inspired by Claude Code hooks.

Build:

- pre-tool hooks
- post-tool hooks
- post-edit hooks
- stop-failure hooks
- verification hooks
- policy packs:
  - safe-default
  - codebase-strict
  - auto-format-and-test
  - enterprise-audit

Use cases:

- auto-run formatter after edits
- auto-run targeted tests on touched files
- auto-log dangerous actions
- auto-block forbidden commands or paths

## Phase 3: Repo Intelligence

Primary repo: `openclaude-cli`

Inspired by Aider repo map.

Build:

- lightweight repo map generator
- symbol index
- dependency-aware relevance ranking
- workspace-aware map for monorepos
- file importance graph

Benefits:

- better edits with less context waste
- fewer random file reads
- better architectural consistency
- improved large-repo performance

## Phase 4: Verifier and Reviewer Specialists

Primary repo: `openclaude-cli`

Inspired by Codex review discipline, Claude subagents, and OpenHands agent roles.

Build:

- `reviewer` specialist
- `tester` specialist
- `debugger` specialist
- `researcher` specialist

Rules:

- main agent can delegate focused tasks
- specialists get limited tools where appropriate
- verifier runs before final completion on risky tasks
- review findings should be structured and severity-ranked

## Phase 5: Premium Execution UI

Primary repo: `openclaude-vscode`

Build:

- transcript timeline with clearer state transitions
- real-time file change counters:
  - added lines
  - removed lines
  - files touched
- proper command rendering for bash and shell blocks
- richer diff summaries while edits are streaming
- recoveries shown as "agent adapted strategy" instead of vague failure noise
- reduced duplicate loaders and duplicate "thinking" surfaces
- replayable tool execution trail

This phase should make the UI feel closer to top-tier agent products without losing current OpenClaude customizations.

## Phase 6: Structured Clarification and Decision Control

Primary repo: `openclaude-cli` plus `openclaude-vscode`

Build:

- better elicitation schema coverage across providers
- option cards with:
  - short explanation
  - recommended choice
  - consequence preview
- agent should ask only when ambiguity is truly decision-relevant
- persist the user's answer into session memory so the same question is not repeated

## Phase 7: Dynamic Extension and Capability Discovery

Primary repo: `openclaude-vscode` plus `openclaude-cli`

Inspired by Goose extension management and MCP flexibility.

Build:

- recommend plugins/extensions based on task intent
- session-scoped enable/disable
- explain why a capability is needed
- allow one-click enablement from UI
- detect unused extensions and suggest cleanup

Example:

- user asks to query Postgres
- OpenClaude notices no DB tool exists
- it recommends a PostgreSQL MCP server with rationale
- user approves once
- session continues without resetting context

## Phase 8: Multi-Agent Teams and Worktrees

Primary repo: `openclaude-cli`

Inspired by Claude Code parallel work and OpenHands platform thinking.

Build:

- specialist agent spawning
- worktree-aware task delegation
- shared parent task board
- result aggregation
- bounded delegation budget

Example:

- agent A investigates bug reproduction
- agent B checks test failures
- agent C reviews impacted files
- parent agent merges conclusions into one execution plan

## Phase 9: Observability, Evals, and Trust

Primary repo: both

Build:

- structured event logs
- transcript-to-eval fixtures
- regression suites for common agent failures
- path-resolution evals
- monorepo command discovery evals
- provider compatibility smoke tests
- UI playback fixtures for tool/result rendering

This is the phase that keeps OpenClaude from becoming flashy but unreliable.

## Immediate Build Order

This is the best order to execute from here:

1. Finish and ship bounded smart recovery in `openclaude-cli`
2. Surface recovery attempts clearly in `openclaude-vscode`
3. Add hook and policy engine
4. Add repo map and workspace-aware command discovery
5. Add verifier specialist before final answer
6. Add dynamic extension recommendations
7. Add multi-agent delegation
8. Add eval packs for all of the above

## Near-Term Concrete Backlog

### CLI backlog

- generalize `toolFailureLoopGuard` into a broader recovery planner
- record failed command fingerprints and compare retries
- inspect workspace `package.json` scripts before retrying test commands
- search parent and sibling `node_modules` safely in monorepos
- add verifier transition before final completion on edit tasks
- emit structured recovery events for the UI

### VS Code backlog

- show "recovery in progress" cards only when a real recovery attempt exists
- render shell commands in proper code blocks with copy affordance
- stream file edit counters in real time
- show verifier pass/fail badges
- add extension recommendation cards
- add transcript filtering by tools, edits, tests, and recoveries

## Success Metrics

OpenClaude is improving if we see:

- fewer agent stops after recoverable command failures
- fewer repeated identical tool calls
- more successful task completion in monorepo layouts
- fewer noisy UI states
- faster user decision-making with structured choice prompts
- better trust in file edits because the diff story is clearer

## References

These are the main external sources that informed this roadmap:

- OpenAI, "Unrolling the Codex agent loop":
  - https://openai.com/index/unrolling-the-codex-agent-loop/
- OpenAI Codex repository:
  - https://github.com/openai/codex
- OpenAI Codex AGENTS.md notes:
  - https://github.com/openai/codex/blob/main/docs/agents_md.md
- Anthropic Claude Code advanced patterns:
  - https://resources.anthropic.com/hubfs/Claude%20Code%20Advanced%20Patterns_%20Subagents%2C%20MCP%2C%20and%20Scaling%20to%20Real%20Codebases.pdf
- Anthropic Claude Code MCP SDK docs:
  - https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-mcp
- Anthropic Claude Code subagents docs:
  - https://docs.anthropic.com/id/docs/claude-code/sdk/subagents
- Aider repository map docs:
  - https://aider.chat/docs/repomap.html
- OpenHands repository:
  - https://github.com/OpenHands/OpenHands
- Goose extensions docs:
  - https://block.github.io/goose/docs/getting-started/using-extensions/

## Decision

OpenClaude should be built as:

- Codex-grade harness quality
- Claude Code-grade instruction and workflow control
- Aider-grade repo awareness
- OpenHands-grade platform mindset
- Goose-grade extension intelligence

That combination is stronger than copying any one tool.
