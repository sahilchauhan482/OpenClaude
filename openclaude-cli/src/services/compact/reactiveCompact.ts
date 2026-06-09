import type { QuerySource } from '../../constants/querySource.js'
import {
  type CompactionResult,
  type CacheSafePromptData,
} from './compact.js'

type CompactOutcome =
  | { ok: true; result: CompactionResult }
  | {
      ok: false
      reason:
        | 'too_few_groups'
        | 'aborted'
        | 'exhausted'
        | 'error'
        | 'media_unstrippable'
    }

type TryReactiveCompactInput = {
  hasAttempted: boolean
  querySource: QuerySource
  aborted: boolean
  messages: unknown[]
  cacheSafeParams: CacheSafePromptData
}

export function isReactiveCompactEnabled(): boolean {
  return false
}

export function isReactiveOnlyMode(): boolean {
  return false
}

export function isWithheldPromptTooLong(_message: unknown): boolean {
  return false
}

export function isWithheldMediaSizeError(_message: unknown): boolean {
  return false
}

export async function reactiveCompactOnPromptTooLong(
  _messages: unknown[],
  _cacheSafeParams: CacheSafePromptData,
  _options: {
    customInstructions?: string
    trigger: 'manual' | 'automatic'
  },
): Promise<CompactOutcome> {
  return { ok: false, reason: 'exhausted' }
}

export async function tryReactiveCompact(
  input: TryReactiveCompactInput,
): Promise<CompactionResult | null> {
  void input
  return null
}
