import type { HookCallback } from '../types/hooks.js'

const noopHook: HookCallback = {
  type: 'callback',
  callback: async () => ({}) as any,
}

export function registerAttributionHooks(): void {}

export function clearAttributionCaches(): void {}

export function sweepFileContentCache(): void {}

export const attributionHookCallbacks = [noopHook]
