import { registerBundledSkill } from '../bundledSkills.js'

const RESEARCH_FIRST_CODING_PROMPT = `# Research First Coding

Use this workflow when the task touches unfamiliar code, an external API, a recently changed dependency, or a behavior that could be easy to guess wrong.

## Operating Rules

1. Inspect before editing. Map the relevant files, tests, scripts, and existing utilities before proposing code changes.
2. Prefer primary sources. For local code, use the repository itself. For external APIs or libraries, use official docs or source when current behavior matters.
3. Capture assumptions explicitly. If a fact is inferred rather than proven, label it and verify it before relying on it.
4. Reuse project patterns. Match existing naming, error handling, state management, logging, and test style.
5. Make the smallest safe change. Avoid broad rewrites unless the evidence shows they are needed.

## Workflow

1. Build a compact evidence map:
   - relevant entry points
   - adjacent tests
   - existing helpers/utilities
   - current command or build scripts
   - any external docs or source references consulted
2. State the implementation strategy in one short paragraph.
3. Edit only the files needed for the chosen strategy.
4. Run targeted verification first, then broader checks when the risk justifies it.
5. End with an evidence-backed summary: what changed, what was tested, and any residual risk.

## Failure Handling

If a command or lookup fails, do not stop after one path. Try the next likely resolution:

1. confirm current working directory
2. locate the package/script/tool with repository search
3. try the workspace-relative invocation
4. inspect package manager layout
5. explain the final blocker only after alternatives are exhausted
`

const SECURITY_REVIEW_PLUS_PROMPT = `# Security Review Plus

Run a severity-ranked security review of the current task, diff, or named area. Fix safe issues directly when the user's request permits code changes.

## Review Surface

Check for:

1. secrets and credential exposure
2. authentication and authorization bypass
3. command execution, shell quoting, and unsafe argument composition
4. path traversal, symlink, and workspace-boundary escapes
5. file permissions, temporary-file races, and unsafe cleanup
6. network calls, SSRF-style inputs, redirects, and proxy behavior
7. dependency, install, and script execution risk
8. prompt-injection or tool-use escalation risks
9. unsafe logging of user data, tokens, or internal prompts
10. frontend injection risks such as HTML, markdown, URL, and CSP handling

## Output Contract

Findings first, ordered by severity. Each finding must include:

- severity: critical, high, medium, low
- file and line when available
- impact
- concrete fix
- whether it was fixed now or needs user/product decision

If no findings are found, say that explicitly and list the verification performed.

## Fix Policy

Apply fixes when they are:

1. local and low-risk
2. clearly correct from existing patterns
3. testable in the current workspace

Pause and ask only when the fix changes user-visible security policy, authentication behavior, data retention, or permissions.
`

const VERIFICATION_LOOP_PLUS_PROMPT = `# Verification Loop Plus

Use this when a task must be proven, not just built. The goal is to convert "it should work" into evidence.

## Verification Plan

1. Identify the behavior contract.
2. List the highest-risk failure modes.
3. Choose the smallest targeted checks that cover those risks.
4. Run checks in increasing cost order.
5. If a check fails, diagnose and adapt instead of repeatedly running the same command.

## Adaptive Command Recovery

When a command fails due to missing paths, modules, scripts, or workspace layout:

1. inspect the exact error
2. locate the binary or script with repository search
3. try the workspace-relative invocation
4. try the nearest package directory
5. try direct node/bun invocation of the located binary
6. record the working command for future runs

Only stop after at least two plausible alternatives have been tried or the failure is destructive/risky to continue.

## Evidence Summary

End with:

- checks run
- pass/fail result for each check
- what each check proves
- remaining untested risk
- recommended next check if more confidence is needed
`

const WORKSPACE_SURFACE_AUDIT_PROMPT = `# Workspace Surface Audit

Create a compact operating map of the repository before a large or unfamiliar task.

## Map These Surfaces

1. repository layout and package boundaries
2. build, test, lint, typecheck, and install commands
3. runtime entry points and extension/CLI/webview boundaries
4. configuration files and environment variables
5. persistence/session/state locations
6. policy, hooks, permissions, and tool execution boundaries
7. generated artifacts and files that should not be committed
8. known failing or flaky checks

## Output Contract

Produce:

- a short architecture summary
- a table of important directories/files
- recommended commands for targeted and full verification
- risks or unknowns that should be resolved before major edits

Keep the audit practical. Do not dump a full tree unless the user asks for it.
`

const FRONTEND_PREMIUM_UX_PROMPT = `# Frontend Premium UX

Use this for UI work where the goal is not just functional correctness, but a polished agentic experience.

## UX Principles

1. Preserve the existing design language unless the user asks for a redesign.
2. Make state legible: loading, thinking, tool use, verification, errors, and completion should each feel distinct.
3. Keep the chat readable. Move secondary operational detail behind toggles, drawers, or compact badges.
4. Show evidence, not noise. Prefer counts, verdicts, diffs, and concise labels over repeated generic cards.
5. Design for recovery. Errors should say what failed, what was tried, and what the user or agent can do next.
6. Maintain accessibility: keyboard navigation, labels, focus states, contrast, and reduced-motion safety.

## Implementation Checklist

1. Inspect existing components, tokens, styles, and message/event types.
2. Add the smallest component/state changes that support the desired UX.
3. Avoid Tailwind-only class names unless Tailwind is actually compiled in this surface.
4. Test rendering logic with targeted unit tests where available.
5. Run the webview build/typecheck or the closest local equivalent.

## Final Review

Report:

- what changed visually
- what state transitions were covered
- how noisy/advanced details are hidden or revealed
- what was tested
`

function addUserFocus(prompt: string, args: string): string {
  const trimmed = args.trim()
  if (!trimmed) return prompt
  return `${prompt}\n\n## User Focus\n\n${trimmed}\n`
}

export function registerCuratedPowerSkills(): void {
  registerBundledSkill({
    name: 'research-first-coding',
    description:
      'Investigate local patterns and primary sources before editing unfamiliar code or APIs.',
    whenToUse:
      'Use before coding in unfamiliar areas, external API integrations, dependency-sensitive work, or any task where guessing could create churn.',
    argumentHint: '[task or area to investigate]',
    userInvocable: true,
    async getPromptForCommand(args) {
      return [{ type: 'text', text: addUserFocus(RESEARCH_FIRST_CODING_PROMPT, args) }]
    },
  })

  registerBundledSkill({
    name: 'security-review-plus',
    description:
      'Run a severity-ranked security review and fix safe issues directly.',
    whenToUse:
      'Use for auth, secrets, command execution, file access, network calls, permissions, dependency risk, or pre-release hardening.',
    argumentHint: '[diff, feature, file, or risk area]',
    userInvocable: true,
    async getPromptForCommand(args) {
      return [{ type: 'text', text: addUserFocus(SECURITY_REVIEW_PLUS_PROMPT, args) }]
    },
  })

  registerBundledSkill({
    name: 'verification-loop-plus',
    description:
      'Create and execute an adaptive verification loop with evidence-backed results.',
    whenToUse:
      'Use after code changes, bug fixes, flaky command failures, or any task where pass/fail evidence matters.',
    argumentHint: '[behavior, command, or change to verify]',
    userInvocable: true,
    async getPromptForCommand(args) {
      return [{ type: 'text', text: addUserFocus(VERIFICATION_LOOP_PLUS_PROMPT, args) }]
    },
  })

  registerBundledSkill({
    name: 'workspace-surface-audit',
    description:
      'Map repository surfaces, commands, boundaries, and risks before large work.',
    whenToUse:
      'Use when onboarding to a repo, merging multi-package work, preparing a large change, or diagnosing workspace layout confusion.',
    argumentHint: '[repo area or goal]',
    userInvocable: true,
    async getPromptForCommand(args) {
      return [{ type: 'text', text: addUserFocus(WORKSPACE_SURFACE_AUDIT_PROMPT, args) }]
    },
  })

  registerBundledSkill({
    name: 'frontend-premium-ux',
    description:
      'Improve agentic UI polish, state clarity, accessibility, and noise control.',
    whenToUse:
      'Use for chat UI, tool cards, diffs, loading states, verification badges, settings surfaces, or any frontend UX polish task.',
    argumentHint: '[screen, component, or UX problem]',
    userInvocable: true,
    async getPromptForCommand(args) {
      return [{ type: 'text', text: addUserFocus(FRONTEND_PREMIUM_UX_PROMPT, args) }]
    },
  })
}
