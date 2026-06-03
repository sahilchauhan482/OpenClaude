import type { ToolActivity } from '../hooks/useChat';

export interface LiveStatus {
  kind: 'thinking' | 'tool';
  label: string;
  detail?: string;
}

/**
 * Derive the live status row shown in the chat transcript while a turn is running.
 * We keep this separate from the footer spinner so the conversation itself stays chatty.
 */
export function getLiveStatus(toolActivity: ToolActivity | null, isStreaming: boolean): LiveStatus | null {
  if (!isStreaming) return null;

  if (toolActivity) {
    return {
      kind: 'tool',
      label: toolActivity.toolName || 'Tool',
      detail: toolActivity.description || undefined,
    };
  }

  return {
    kind: 'thinking',
    label: 'Thinking...',
    detail: 'Working through the next response',
  };
}
