import type { SessionInfo } from '../session/sessionTracker';
import {
  type ObservabilitySnapshot,
  type StructuredObservabilityEvent,
  summarizeSessionInfo,
} from './eventLog';
import type { ToolPlaybackFixture } from './uiPlaybackFixtures';

export interface TranscriptEvalFixture {
  schemaVersion: 1;
  exportedAt: string;
  session: Record<string, unknown> | undefined;
  prompt: {
    userMessages: Array<{
      id: string;
      text: string;
      timestamp?: string;
    }>;
    assistantMessages: Array<{
      id: string;
      model?: string;
      blockCount: number;
      timestamp?: string;
    }>;
  };
  observability: ObservabilitySnapshot;
  playback: {
    tools: ToolPlaybackFixture[];
  };
  assertions: {
    hasRecoverySignals: boolean;
    hasDelegationSignals: boolean;
    hasVerificationSignals: boolean;
    completionComplete: boolean;
    eventKinds: string[];
  };
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return '';
  }

  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') {
      continue;
    }
    const value = block as Record<string, unknown>;
    if (typeof value.text === 'string') {
      parts.push(value.text);
    } else if (typeof value.content === 'string') {
      parts.push(value.content);
    } else if (Array.isArray(value.content)) {
      const nested = extractTextFromContent(value.content);
      if (nested) {
        parts.push(nested);
      }
    }
  }

  return parts.join('\n').trim();
}

function normalizeTranscriptMessages(
  messages: Array<Record<string, unknown>>,
): TranscriptEvalFixture['prompt'] {
  const userMessages: TranscriptEvalFixture['prompt']['userMessages'] = [];
  const assistantMessages: TranscriptEvalFixture['prompt']['assistantMessages'] = [];

  for (const message of messages) {
    if (message.type === 'user') {
      const rawMessage = message.message && typeof message.message === 'object'
        ? message.message as Record<string, unknown>
        : message;
      const text = extractTextFromContent(rawMessage.content ?? message.content);
      if (!text) {
        continue;
      }
      userMessages.push({
        id: typeof message.uuid === 'string' ? message.uuid : `user-${userMessages.length + 1}`,
        text,
        timestamp: typeof message.timestamp === 'string' ? message.timestamp : undefined,
      });
    }

    if (message.type === 'assistant') {
      const rawMessage = message.message && typeof message.message === 'object'
        ? message.message as Record<string, unknown>
        : message;
      const blockCount = Array.isArray(rawMessage.content) ? rawMessage.content.length : 0;
      assistantMessages.push({
        id: typeof message.uuid === 'string' ? message.uuid : `assistant-${assistantMessages.length + 1}`,
        model: typeof rawMessage.model === 'string' ? rawMessage.model : undefined,
        blockCount,
        timestamp: typeof message.timestamp === 'string' ? message.timestamp : undefined,
      });
    }
  }

  return {
    userMessages,
    assistantMessages,
  };
}

function deriveAssertions(events: StructuredObservabilityEvent[], snapshot: ObservabilitySnapshot) {
  const eventKinds = Array.from(new Set(events.map((event) => event.kind))).sort();
  const joinedSummaries = events.map((event) => event.summary.toLowerCase()).join('\n');

  return {
    hasRecoverySignals: events.some((event) => event.category === 'recovery'),
    hasDelegationSignals: events.some((event) => event.category === 'delegation'),
    hasVerificationSignals:
      events.some((event) => event.category === 'verification')
      || /verdict:|reviewer|verification/.test(joinedSummaries),
    completionComplete: snapshot.completeness.isComplete,
    eventKinds,
  };
}

export function createTranscriptEvalFixture(options: {
  session?: SessionInfo;
  transcriptMessages: Array<Record<string, unknown>>;
  observability: ObservabilitySnapshot;
  playbackFixtures?: ToolPlaybackFixture[];
}): TranscriptEvalFixture {
  const prompt = normalizeTranscriptMessages(options.transcriptMessages);
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    session: summarizeSessionInfo(options.session),
    prompt,
    observability: options.observability,
    playback: {
      tools: options.playbackFixtures ?? [],
    },
    assertions: deriveAssertions(options.observability.events, options.observability),
  };
}
