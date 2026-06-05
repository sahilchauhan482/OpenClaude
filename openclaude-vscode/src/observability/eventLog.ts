import type { SessionInfo } from '../session/sessionTracker';

export type ObservabilityEventSource = 'host' | 'cli' | 'webview';

export type ObservabilityEventCategory =
  | 'process'
  | 'user'
  | 'assistant'
  | 'tool'
  | 'recovery'
  | 'verification'
  | 'delegation'
  | 'provider'
  | 'ui'
  | 'session';

export interface StructuredObservabilityEvent {
  id: string;
  sessionId: string | null;
  timestamp: string;
  source: ObservabilityEventSource;
  category: ObservabilityEventCategory;
  kind: string;
  summary: string;
  payload: Record<string, unknown>;
}

export interface ObservabilityCompleteness {
  requiredKinds: string[];
  presentKinds: string[];
  missingKinds: string[];
  isComplete: boolean;
}

export interface ObservabilitySnapshot {
  sessionId: string | null;
  exportedAt: string;
  totalEvents: number;
  countsByCategory: Record<ObservabilityEventCategory, number>;
  completeness: ObservabilityCompleteness;
  events: StructuredObservabilityEvent[];
}

interface RecordEventInput {
  sessionId?: string | null;
  source: ObservabilityEventSource;
  category: ObservabilityEventCategory;
  kind: string;
  summary: string;
  payload?: Record<string, unknown>;
  timestamp?: string;
}

function createEmptyCategoryCounts(): Record<ObservabilityEventCategory, number> {
  return {
    process: 0,
    user: 0,
    assistant: 0,
    tool: 0,
    recovery: 0,
    verification: 0,
    delegation: 0,
    provider: 0,
    ui: 0,
    session: 0,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function truncate(text: string, limit = 120): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 3)}...`;
}

function extractAssistantBlockCount(message: Record<string, unknown>): number {
  const rawMessage = isObject(message.message) ? message.message : undefined;
  const content = rawMessage?.content;
  return Array.isArray(content) ? content.length : 0;
}

function inferVerificationCategory(summary: string): ObservabilityEventCategory {
  const normalized = summary.toLowerCase();
  if (normalized.includes('verdict:') || normalized.includes('reviewer') || normalized.includes('verification')) {
    return 'verification';
  }
  return 'tool';
}

export function normalizeCliObservabilityEvent(
  msg: Record<string, unknown>,
): Omit<StructuredObservabilityEvent, 'id' | 'timestamp'> | null {
  const sessionId = typeof msg.session_id === 'string' ? msg.session_id : null;

  switch (msg.type) {
    case 'user': {
      return {
        sessionId,
        source: 'cli',
        category: 'user',
        kind: 'cli_user_message',
        summary: 'User message received by CLI',
        payload: {
          uuid: msg.uuid,
          isSynthetic: msg.isSynthetic,
        },
      };
    }
    case 'assistant': {
      return {
        sessionId,
        source: 'cli',
        category: 'assistant',
        kind: 'cli_assistant_message',
        summary: `Assistant message emitted with ${extractAssistantBlockCount(msg)} blocks`,
        payload: {
          uuid: msg.uuid,
          parentToolUseId: msg.parent_tool_use_id,
          blockCount: extractAssistantBlockCount(msg),
        },
      };
    }
    case 'result': {
      const isError = Boolean(msg.is_error);
      return {
        sessionId,
        source: 'cli',
        category: isError ? 'recovery' : 'assistant',
        kind: 'cli_turn_result',
        summary: isError ? 'Turn ended with an error result' : 'Turn completed successfully',
        payload: {
          subtype: msg.subtype,
          isError,
          durationMs: msg.duration_ms,
          numTurns: msg.num_turns,
          totalCostUsd: msg.total_cost_usd,
        },
      };
    }
    case 'tool_progress': {
      const toolName = typeof msg.tool_name === 'string' ? msg.tool_name : 'tool';
      return {
        sessionId,
        source: 'cli',
        category: 'tool',
        kind: 'cli_tool_progress',
        summary: `Tool progress: ${toolName}`,
        payload: {
          toolName,
          taskId: msg.task_id,
          toolUseId: msg.tool_use_id,
          elapsedTimeSeconds: msg.elapsed_time_seconds,
        },
      };
    }
    case 'tool_use_summary': {
      const summary = typeof msg.summary === 'string' ? msg.summary : '';
      return {
        sessionId,
        source: 'cli',
        category: inferVerificationCategory(summary),
        kind: 'cli_tool_use_summary',
        summary: truncate(summary || 'Tool summary emitted'),
        payload: {
          summary,
          precedingToolUseIds: Array.isArray(msg.preceding_tool_use_ids) ? msg.preceding_tool_use_ids : [],
        },
      };
    }
    case 'rate_limit_event': {
      return {
        sessionId,
        source: 'cli',
        category: 'recovery',
        kind: 'cli_rate_limit_event',
        summary: 'Provider rate limit event reported',
        payload: {
          rateLimitInfo: isObject(msg.rate_limit_info) ? msg.rate_limit_info : {},
        },
      };
    }
    case 'auth_status': {
      return {
        sessionId,
        source: 'cli',
        category: 'provider',
        kind: 'cli_auth_status',
        summary: Boolean(msg.error) ? 'Provider authentication error surfaced' : 'Provider auth status updated',
        payload: {
          isAuthenticating: msg.isAuthenticating,
          error: msg.error,
        },
      };
    }
    case 'control_request': {
      const request = isObject(msg.request) ? msg.request : undefined;
      const subtype = typeof request?.subtype === 'string' ? request.subtype : 'unknown';
      return {
        sessionId,
        source: 'cli',
        category: subtype === 'can_use_tool' ? 'tool' : 'ui',
        kind: 'cli_control_request',
        summary: `Control request: ${subtype}`,
        payload: {
          requestId: msg.request_id,
          subtype,
        },
      };
    }
    case 'system': {
      const subtype = typeof msg.subtype === 'string' ? msg.subtype : 'unknown';
      if (subtype === 'task_started') {
        return {
          sessionId,
          source: 'cli',
          category: 'delegation',
          kind: 'cli_task_started',
          summary: `Worker started: ${truncate(String(msg.description ?? 'task'))}`,
          payload: {
            taskId: msg.task_id,
            taskType: msg.task_type,
            workflowName: msg.workflow_name,
            description: msg.description,
          },
        };
      }
      if (subtype === 'task_progress') {
        return {
          sessionId,
          source: 'cli',
          category: 'delegation',
          kind: 'cli_task_progress',
          summary: `Worker progress: ${truncate(String(msg.description ?? 'task'))}`,
          payload: {
            taskId: msg.task_id,
            usage: msg.usage,
            lastToolName: msg.last_tool_name,
            summary: msg.summary,
          },
        };
      }
      if (subtype === 'task_notification') {
        return {
          sessionId,
          source: 'cli',
          category: 'delegation',
          kind: 'cli_task_notification',
          summary: `Worker ${String(msg.status ?? 'completed')}: ${truncate(String(msg.summary ?? ''))}`,
          payload: {
            taskId: msg.task_id,
            status: msg.status,
            summary: msg.summary,
            usage: msg.usage,
          },
        };
      }
      if (subtype === 'post_turn_summary') {
        return {
          sessionId,
          source: 'cli',
          category: 'delegation',
          kind: 'cli_post_turn_summary',
          summary: `Parent summary: ${truncate(String(msg.title ?? 'summary'))}`,
          payload: {
            summarizesUuid: msg.summarizes_uuid,
            title: msg.title,
            statusCategory: msg.status_category,
            description: msg.description,
            recentAction: msg.recent_action,
            needsAction: msg.needs_action,
          },
        };
      }
      if (subtype === 'api_retry') {
        return {
          sessionId,
          source: 'cli',
          category: 'recovery',
          kind: 'cli_api_retry',
          summary: `API retry planned (attempt ${String(msg.attempt ?? '?')})`,
          payload: {
            attempt: msg.attempt,
            maxRetries: msg.max_retries,
            retryDelayMs: msg.retry_delay_ms,
            errorStatus: msg.error_status,
          },
        };
      }
      if (subtype === 'compact_boundary') {
        return {
          sessionId,
          source: 'cli',
          category: 'recovery',
          kind: 'cli_compact_boundary',
          summary: 'Context compaction boundary crossed',
          payload: {
            compactMetadata: msg.compact_metadata,
          },
        };
      }
      if (subtype === 'ai-title') {
        return {
          sessionId,
          source: 'cli',
          category: 'session',
          kind: 'cli_ai_title',
          summary: `Session titled: ${truncate(String(msg.title ?? 'Untitled Session'))}`,
          payload: {
            title: msg.title,
          },
        };
      }
      if (subtype === 'informational') {
        return {
          sessionId,
          source: 'cli',
          category: 'ui',
          kind: 'cli_informational_notice',
          summary: truncate(String(msg.content ?? 'Informational notice')),
          payload: {
            content: msg.content,
          },
        };
      }
      return {
        sessionId,
        source: 'cli',
        category: 'session',
        kind: `cli_system_${subtype}`,
        summary: `System event: ${subtype}`,
        payload: {
          subtype,
        },
      };
    }
    default:
      return null;
  }
}

export function evaluateObservabilityCompleteness(
  events: StructuredObservabilityEvent[],
): ObservabilityCompleteness {
  const presentKinds = Array.from(new Set(events.map((event) => event.kind))).sort();
  const requiredKinds = ['host_process_state_changed'];

  if (events.some((event) => event.kind === 'host_prompt_submitted')) {
    requiredKinds.push('cli_turn_result');
  }

  if (events.some((event) => event.category === 'delegation')) {
    requiredKinds.push('cli_task_started', 'cli_task_notification');
  }

  if (events.some((event) => event.category === 'recovery')) {
    requiredKinds.push(
      events.some((event) => event.kind === 'cli_api_retry')
        ? 'cli_api_retry'
        : 'cli_turn_result',
    );
  }

  const dedupedRequired = Array.from(new Set(requiredKinds));
  const missingKinds = dedupedRequired.filter((kind) => !presentKinds.includes(kind));

  return {
    requiredKinds: dedupedRequired,
    presentKinds,
    missingKinds,
    isComplete: missingKinds.length === 0,
  };
}

export function buildObservabilitySnapshotFromEvents(
  events: StructuredObservabilityEvent[],
  sessionId?: string | null,
): ObservabilitySnapshot {
  const countsByCategory = createEmptyCategoryCounts();
  for (const event of events) {
    countsByCategory[event.category] += 1;
  }

  return {
    sessionId: sessionId ?? null,
    exportedAt: new Date().toISOString(),
    totalEvents: events.length,
    countsByCategory,
    completeness: evaluateObservabilityCompleteness(events),
    events,
  };
}

export class ObservabilityEventLog {
  private events: StructuredObservabilityEvent[] = [];
  private nextId = 1;

  record(input: RecordEventInput): StructuredObservabilityEvent {
    const event: StructuredObservabilityEvent = {
      id: `evt-${this.nextId++}`,
      sessionId: input.sessionId ?? null,
      timestamp: input.timestamp ?? new Date().toISOString(),
      source: input.source,
      category: input.category,
      kind: input.kind,
      summary: input.summary,
      payload: input.payload ?? {},
    };
    this.events.push(event);
    return event;
  }

  recordCliMessage(msg: Record<string, unknown>): StructuredObservabilityEvent | null {
    const normalized = normalizeCliObservabilityEvent(msg);
    if (!normalized) {
      return null;
    }
    return this.record(normalized);
  }

  rebindSession(fromSessionId: string | null | undefined, toSessionId: string): void {
    const fromId = fromSessionId ?? null;
    for (const event of this.events) {
      if (event.sessionId === fromId) {
        event.sessionId = toSessionId;
      }
    }
  }

  clearSession(sessionId?: string | null): void {
    if (sessionId === undefined) {
      this.events = [];
      return;
    }
    this.events = this.events.filter((event) => event.sessionId !== (sessionId ?? null));
  }

  getEvents(sessionId?: string | null): StructuredObservabilityEvent[] {
    if (sessionId === undefined) {
      return [...this.events];
    }
    return this.events.filter((event) => event.sessionId === (sessionId ?? null));
  }

  snapshot(sessionId?: string | null): ObservabilitySnapshot {
    const scopedEvents = this.getEvents(sessionId);
    return buildObservabilitySnapshotFromEvents(scopedEvents, sessionId);
  }
}

export function summarizeSessionInfo(session: SessionInfo | undefined): Record<string, unknown> | undefined {
  if (!session) {
    return undefined;
  }

  return {
    id: session.id,
    title: session.title,
    model: session.model,
    provider: session.provider,
    timestamp: session.timestamp.toISOString(),
    createdAt: session.createdAt.toISOString(),
    messageCount: session.messageCount,
    cwd: session.cwd,
    gitBranch: session.gitBranch,
  };
}
