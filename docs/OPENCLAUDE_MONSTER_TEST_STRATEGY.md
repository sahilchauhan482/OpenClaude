# OpenClaude Monster Test Strategy

## Purpose

OpenClaude should not rely on users to discover regressions one prompt at a time.

Every meaningful capability must be verified by us before it is treated as complete.

This document defines the minimum verification standard for roadmap work.

## Testing Rules

1. Build success is not enough.
2. Every phase must include behavior tests, not only snapshot or smoke coverage.
3. Every fixed bug should gain a regression test when practical.
4. New autonomous behaviors must be tested on both success paths and failure paths.
5. UI changes must be tested for rendering and interaction, not only compilation.
6. Final implementation reports should state exactly what was verified and what was not.

## Verification Layers

### 1. Unit tests

Use for:

- pure helpers
- scoring logic
- failure classification
- prompt section generation
- event formatting

Required when:

- logic can be isolated
- edge cases are likely
- ordering, ranking, or categorization matters

### 2. Integration tests

Use for:

- prompt assembly
- tool-loop adaptations
- hook materialization
- session restoration
- repo/workspace detection
- provider config behavior

Required when:

- multiple modules interact
- state or environment influences behavior
- prompt context affects agent decisions

### 3. Workflow tests

Use for:

- realistic CLI task flows
- repeated tool failure recovery
- monorepo command discovery
- structured clarification flows
- session resume and follow-up behavior

Required when:

- user-visible behavior depends on multiple turns or retries
- the main risk is orchestration, not an isolated helper

### 4. UI behavior tests

Use for:

- tool cards
- diff rendering
- shell command formatting
- structured choice submission
- timeline/recovery cards

Required when:

- users must visually interpret state
- a feature can be “implemented” but still unusable in practice

### 5. Smoke tests

Use for:

- extension startup
- webview build/load
- targeted CLI commands
- provider routing sanity checks

Required when:

- feature crosses runtime boundaries
- packaging/install layout can break resolution

## Phase-by-Phase Minimum Standard

### Phase 1: Self-Healing Execution

Must verify:

- failure classification accuracy
- materially different second-attempt strategy
- no infinite retry loops
- workspace-aware fallback behavior

Minimum checks:

- unit tests for classification
- integration tests for recovery planning
- workflow tests for representative failure scenarios

### Phase 2: Hook and Policy Engine

Must verify:

- pack expansion correctness
- hook ordering
- safe blocking behavior
- deterministic post-edit and verification actions

Minimum checks:

- unit tests for pack generation
- integration tests for hook execution wiring
- workflow tests for guarded commands and post-edit flows

### Phase 3: Repo Intelligence

Must verify:

- manifest detection
- monorepo/root-child awareness
- repo-map relevance
- code-surface extraction
- prompt injection stability

Minimum checks:

- unit tests for summary extraction
- integration tests for prompt output
- workflow tests for monorepo targeting behavior

### Phase 4: Verifier and Reviewer Specialists

Must verify:

- delegation routing
- structured findings
- PASS/FAIL/PARTIAL handling
- no false “done” after failed verification

Minimum checks:

- unit tests for verdict parsing and finding structure
- integration tests for specialist invocation
- workflow tests for verifier gate before final completion

### Phase 5: Premium Execution UI

Must verify:

- command rendering
- diff counters
- recovery timeline states
- no duplicate/noisy status cards

Minimum checks:

- component rendering tests
- interaction tests
- smoke test for webview build

### Phase 6: Structured Clarification

Must verify:

- option cards render correctly
- recommendation labeling is correct
- user choice is persisted and reused
- repeated unnecessary elicitation does not occur

### Phase 7: Dynamic Extension Discovery

Must verify:

- recommendation triggers
- rationale visibility
- approval flow correctness
- session-scoped enablement behavior

### Phase 8: Multi-Agent Teams

Must verify:

- bounded delegation
- task/result isolation
- parent aggregation correctness
- no duplicated or conflicting execution

### Phase 9: Observability and Evals

Must verify:

- structured event completeness
- replay fixture stability
- regression suite coverage for prior bug classes

## Mandatory Report Format For Future Work

For every meaningful implementation batch, report:

- what changed
- what tests were added
- what commands were run
- pass/fail result
- what was not verified
- residual risks

## Current Expectation

From this point onward, roadmap work should be treated as incomplete unless:

- implementation exists
- relevant tests exist
- those tests were actually run
- the verification result is explicitly reported
