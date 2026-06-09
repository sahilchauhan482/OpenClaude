// Stub — snipCompact not included in source snapshot
export function snipCompact() {
  return null
}
export function isSnipMarkerMessage(_msg: unknown): boolean {
  return false
}
/* eslint-disable @typescript-eslint/no-explicit-any */
export function snipCompactIfNeeded(_messages: any[], _options?: Record<string, unknown>): { messages: any[]; tokensFreed: number; boundaryMessage?: any } {
  return { messages: _messages, tokensFreed: 0 }
}
export const isSnipRuntimeEnabled = (): boolean => false
export const SNIP_NUDGE_TEXT = ''
