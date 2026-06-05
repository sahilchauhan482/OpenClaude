import type { ToolActivity } from '../hooks/useChat';

export interface LiveStatus {
  kind: 'tool';
  label: string;
  detail?: string;
  headline: string;
  ticker?: string;
}

/**
 * Derive the live status row shown in the chat transcript while a turn is running.
 * Keep transcript-level status focused on concrete live tool activity and let the
 * footer/composer own generic "thinking" feedback.
 */
export function getLiveStatus(toolActivity: ToolActivity | null, isStreaming: boolean): LiveStatus | null {
  if (!isStreaming) return null;

  if (!toolActivity) return null;

  return {
    kind: 'tool',
    label: toolActivity.toolName || 'Tool',
    headline: summarizeToolName(toolActivity.toolName || 'Tool'),
    detail: toolActivity.description || undefined,
    ticker: 'Running live',
  };
}

function summarizeToolName(toolName: string): string {
  const normalized = toolName.trim();
  if (!normalized) {
    return 'Using tool';
  }

  if (/bash|shell|command|terminal/i.test(normalized)) {
    return 'Running command';
  }

  if (/write|edit|patch|file/i.test(normalized)) {
    return 'Editing files';
  }

  if (/search|grep|glob|find/i.test(normalized)) {
    return 'Searching code';
  }

  if (/web|browser|fetch|http/i.test(normalized)) {
    return 'Checking the web';
  }

  return `Using ${normalized}`;
}
