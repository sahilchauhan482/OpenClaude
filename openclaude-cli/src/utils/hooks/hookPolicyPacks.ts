import type { HookEvent } from 'src/entrypoints/agentSdkTypes.js'

import type { HookMatcher, SettingsJson } from '../settings/types.js'

export type HookPolicyPackId =
  | 'safe-default'
  | 'codebase-strict'
  | 'auto-format-and-test'
  | 'enterprise-audit'

type HookPolicyPackDefinition = {
  id: HookPolicyPackId
  label: string
  description: string
  hooks: Partial<Record<HookEvent, HookMatcher[]>>
}

const POLICY_PACKS: Record<HookPolicyPackId, HookPolicyPackDefinition> = {
  'safe-default': {
    id: 'safe-default',
    label: 'Safe Default',
    description:
      'Adds lightweight safety reminders around risky tools and failing turns.',
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'prompt',
              if: 'Bash(git push*|git reset*|rm -rf*|del /s*)',
              prompt:
                'Review this upcoming tool call for reversibility and blast radius. If it looks risky or destructive, return concise additionalContext telling the agent to pause and confirm scope before proceeding. Hook input: $ARGUMENTS',
              statusMessage: 'Checking risky command safety',
            },
          ],
        },
      ],
      PostToolUseFailure: [
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'prompt',
              prompt:
                'The previous Bash tool call failed. Return concise additionalContext that tells the agent to inspect the exact error, avoid repeating the same command unchanged, and prefer a materially different recovery step. Hook input: $ARGUMENTS',
              statusMessage: 'Preparing safer recovery guidance',
            },
          ],
        },
      ],
    },
  },
  'codebase-strict': {
    id: 'codebase-strict',
    label: 'Strict Codebase Verification',
    description:
      'Encourages tighter verification discipline after edits and before turn completion.',
    hooks: {
      PostToolUse: [
        {
          matcher: 'Edit',
          hooks: [
            {
              type: 'prompt',
              prompt:
                'A file edit just completed. Return concise additionalContext reminding the agent to verify affected behavior with the smallest relevant check before calling the task done. Hook input: $ARGUMENTS',
              statusMessage: 'Reviewing edit verification needs',
            },
          ],
        },
        {
          matcher: 'Write',
          hooks: [
            {
              type: 'prompt',
              prompt:
                'A file write just completed. Return concise additionalContext reminding the agent to re-read the changed file when needed and verify the result before final completion. Hook input: $ARGUMENTS',
              statusMessage: 'Reviewing write verification needs',
            },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            {
              type: 'prompt',
              prompt:
                'Before the turn ends, check whether the agent appears to be concluding without verification. If verification is missing, return short additionalContext telling the agent to run the smallest relevant check or state clearly why verification was not possible.',
              statusMessage: 'Checking completion quality',
            },
          ],
        },
      ],
    },
  },
  'auto-format-and-test': {
    id: 'auto-format-and-test',
    label: 'Auto Format & Test',
    description:
      'Adds post-edit guidance nudging the agent to run formatter or targeted tests after code changes.',
    hooks: {
      PostToolUse: [
        {
          matcher: 'Edit',
          hooks: [
            {
              type: 'prompt',
              prompt:
                'A code edit finished. Return concise additionalContext telling the agent to inspect nearby scripts/config and run the smallest relevant formatter or targeted test if available. Hook input: $ARGUMENTS',
              statusMessage: 'Planning formatter/test follow-up',
            },
          ],
        },
        {
          matcher: 'Write',
          hooks: [
            {
              type: 'prompt',
              prompt:
                'A file write finished. Return concise additionalContext telling the agent to consider formatter, lint, or targeted test follow-up based on the workspace scripts. Hook input: $ARGUMENTS',
              statusMessage: 'Planning formatter/test follow-up',
            },
          ],
        },
      ],
    },
  },
  'enterprise-audit': {
    id: 'enterprise-audit',
    label: 'Enterprise Audit Trail',
    description:
      'Adds audit-oriented reminders for permission-sensitive and externally visible actions.',
    hooks: {
      PermissionRequest: [
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'prompt',
              prompt:
                'A permission request is being shown for a tool call. Return concise additionalContext telling the agent to state the exact purpose, affected scope, and reversibility of the requested action.',
              statusMessage: 'Preparing audit context',
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'prompt',
              if: 'Bash(git push*|gh pr*|gh issue*|curl *|Invoke-WebRequest *)',
              prompt:
                'An externally visible command may have run. Return concise additionalContext reminding the agent to summarize what changed externally and any follow-up verification needed. Hook input: $ARGUMENTS',
              statusMessage: 'Reviewing externally visible action',
            },
          ],
        },
      ],
    },
  },
}

export function getHookPolicyPackDefinitions(): HookPolicyPackDefinition[] {
  return Object.values(POLICY_PACKS)
}

export function resolveEnabledHookPolicyPacks(
  settings: SettingsJson | undefined,
): HookPolicyPackId[] {
  const configured = settings?.hookPolicyPacks
  if (!Array.isArray(configured)) {
    return []
  }

  const seen = new Set<HookPolicyPackId>()
  const enabled: HookPolicyPackId[] = []
  for (const entry of configured) {
    if (!isHookPolicyPackId(entry) || seen.has(entry)) {
      continue
    }
    seen.add(entry)
    enabled.push(entry)
  }
  return enabled
}

export function getHookPolicyPackMatchers(
  settings: SettingsJson | undefined,
): Array<{
  event: HookEvent
  matcher?: string
  hooks: HookMatcher['hooks']
  packId: HookPolicyPackId
}> {
  const enabled = resolveEnabledHookPolicyPacks(settings)
  const results: Array<{
    event: HookEvent
    matcher?: string
    hooks: HookMatcher['hooks']
    packId: HookPolicyPackId
  }> = []

  for (const packId of enabled) {
    const pack = POLICY_PACKS[packId]
    for (const [event, matchers] of Object.entries(pack.hooks) as Array<
      [HookEvent, HookMatcher[] | undefined]
    >) {
      for (const matcher of matchers ?? []) {
        results.push({
          event,
          matcher: matcher.matcher,
          hooks: matcher.hooks,
          packId,
        })
      }
    }
  }

  return results
}

function isHookPolicyPackId(value: unknown): value is HookPolicyPackId {
  return (
    value === 'safe-default' ||
    value === 'codebase-strict' ||
    value === 'auto-format-and-test' ||
    value === 'enterprise-audit'
  )
}
