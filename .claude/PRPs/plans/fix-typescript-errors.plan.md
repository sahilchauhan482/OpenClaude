# Plan: Fix TypeScript Compilation Errors

## Summary
The project `openclaude-cli` currently fails TypeScript compilation with multiple errors spanning type mismatches in tests, incorrect logic, and missing return types. This plan outlines a systematic approach to resolve these errors, ensuring type safety and code correctness.

## User Story
As a developer, I want a codebase that passes TypeScript compilation, So that I can maintain code quality and rely on type safety during development.

## Problem -> Solution
[Compilation errors in `openclaude-cli`] -> [Clean compilation with strict type checking enabled]

## Metadata
- **Complexity**: Medium
- **Source PRD**: N/A
- **PRD Phase**: N/A
- **Estimated Files**: 10+

---

## UX Design
N/A — internal change

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 (critical) | `src/commands/lsp/lsp.ts` | all | Core LSP logic, type definitions |
| P1 (important) | `src/commands/lsp/lsp.test.ts` | all | LSP test dependencies |
| P2 (reference) | `src/components/FullscreenLayout.tsx` | all | Component structure and error handling |

## External Documentation
No external research needed — feature uses established internal patterns.

---

## Patterns to Mirror

### TYPE_DEFINITION
// SOURCE: `src/commands/lsp/lsp.ts:33-47`
```typescript
type LspServerConfigLike = { ... }
type LspServerInstanceLike = { ... }
type LspServerManagerLike = { ... }
```

### TEST_MOCKING
// SOURCE: `src/commands/lsp/lsp.test.ts:106-126`
```typescript
const deps = { ... }
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `src/commands/lsp/lsp.test.ts` | UPDATE | Fix `LspCommandDeps` mock |
| `src/commands/lsp/lsp.ts` | UPDATE | Fix `LspServerManager` interface/type mismatch |
| `src/components/design-system/ThemeProvider.test.tsx` | UPDATE | Fix theme type mismatch |
| `src/components/DevBar.tsx` | UPDATE | Fix impossible comparison |
| `src/components/FeedbackSurvey/usePostCompactSurvey.tsx` | UPDATE | Fix `unknown` type mismatch |
| `src/components/FullscreenLayout.tsx` | UPDATE | Fix property access on `never` |
| `src/components/LogSelector.tsx` | UPDATE | Fix `unknown` type |
| `src/components/Messages.tsx` | UPDATE | Add missing return |
| `src/components/messages/AttachmentMessage.tsx` | UPDATE | Fix enum/union mismatch |
| `src/components/messages/nullRenderingAttachments.ts` | UPDATE | Fix enum/union mismatch |

## NOT Building
- No new features, only bug fixes for compilation.

---

## Step-by-Step Tasks

### Task 1: Fix LSP Errors
- **ACTION**: Fix `src/commands/lsp/lsp.test.ts` and `src/commands/lsp/lsp.ts`
- **IMPLEMENT**: Update mock types in test and interface definitions in source.
- **VALIDATE**: Run `npx tsc --noEmit` only for these files.

### Task 2: Fix UI Component Errors
- **ACTION**: Fix `DevBar.tsx`, `FullscreenLayout.tsx`, `Messages.tsx`, `LogSelector.tsx`.
- **IMPLEMENT**: Update types, fix impossible comparisons, add return statements.
- **VALIDATE**: Run `npx tsc --noEmit` only for these files.

### Task 3: Fix Attachment and Survey Errors
- **ACTION**: Fix `AttachmentMessage.tsx`, `nullRenderingAttachments.ts`, `usePostCompactSurvey.tsx`.
- **IMPLEMENT**: Fix enum/union mismatches and `unknown` types.
- **VALIDATE**: Run `npx tsc --noEmit` only for these files.

### Task 4: Final Validation
- **ACTION**: Run full compilation check.
- **VALIDATE**: `npx tsc --noEmit --pretty false`.

---

## Validation Commands

### Static Analysis
```bash
npx tsc --noEmit --pretty false
```
EXPECT: Zero type errors

### Unit Tests
```bash
# Run tests for affected area (e.g., LSP tests)
npm test src/commands/lsp/lsp.test.ts
```
EXPECT: All tests pass

---

## Acceptance Criteria
- [ ] TypeScript compilation passes with zero errors
- [ ] Tests pass (including LSP tests)
- [ ] Types are correctly defined for all interfaces and mocks

## Completion Checklist
- [ ] Code follows discovered patterns
- [ ] No type errors
- [ ] Tests pass
- [ ] Self-contained — no questions needed during implementation

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Deep type mismatch chains | High | Medium | Investigate types thoroughly before changing |

## Notes
The errors are largely type-system related, necessitating careful updates to definitions and mocks to match the refined types.
