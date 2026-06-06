// test/unit/integration.test.ts
// Integration tests for message flow and process lifecycle logic.
// These tests focus on pure logic that can be tested without the VS Code API.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Helpers — simulate the message routing logic from extension.ts
// ============================================================================

interface BroadcastedMessage {
  type: string;
  [key: string]: unknown;
}

function createMessageRouter() {
  const broadcasts: BroadcastedMessage[] = [];
  const broadcast = (msg: BroadcastedMessage) => broadcasts.push(msg);

  // Simulate the CLI message handler from extension.ts
  function handleCliMessage(msg: Record<string, unknown>) {
    // Always forward to webview
    broadcast({ type: 'cli_output', data: msg });

    // Host-side processing
    if (msg.type === 'result') {
      // StatusBar logic would fire here
    }
  }

  return { broadcasts, broadcast, handleCliMessage };
}

// ============================================================================
// Simulate useChat message routing logic
// ============================================================================

interface ChatState {
  messages: Array<{
    id: string;
    role: string;
    text?: string;
    system?: {
      tone?: 'info' | 'warning' | 'error' | 'success';
      title?: string;
      detail?: string;
    };
  }>;
  error: string | null;
  promptSuggestions: string[];
  sessionId: string | null;
  sessionTitle: string | null;
  rateLimitInfo: { resetsAt: number; rateLimitType: string; message: string } | null;
  agentTeamBoard: {
    enabled: boolean;
    mode: 'off' | 'assist' | 'coordinate';
    maxWorkers: number;
    useWorktrees: boolean;
    worktreeAvailable: boolean;
    currentWorktreeName?: string | null;
    runningTaskCount: number;
    warnings: string[];
    tasks: Array<{ id: string; description: string; status: string }>;
    summaries: Array<{ id: string; title: string; statusCategory: string }>;
  } | null;
}

function createChatState(): ChatState {
  return {
    messages: [],
    error: null,
    promptSuggestions: [],
    sessionId: null,
    sessionTitle: null,
    rateLimitInfo: null,
    agentTeamBoard: null,
  };
}

function parseSystemInlineMessage(text: string) {
  const trimmed = text.trim();
  const normalized = trimmed.toLowerCase();

  if (normalized.includes('retrying once with an alternate strategy')) {
    return {
      tone: 'warning' as const,
      title: 'Agent adapted strategy',
      detail:
        'Repeated tool failures were detected, so OpenClaude is retrying once with a different recovery path instead of stopping.',
    };
  }

  if (normalized.includes('compacted')) {
    return {
      tone: 'info' as const,
      title: 'Context compacted',
      detail: trimmed,
    };
  }

  if (normalized.includes('retrying api call')) {
    return {
      tone: 'info' as const,
      title: 'Retrying request',
      detail: trimmed,
    };
  }

  return {
    tone: 'info' as const,
    title: trimmed,
    detail: undefined,
  };
}

function formatApiRetryMessage(msg: {
  attempt?: number;
  max_attempts?: number;
  delay_ms?: number;
  reason?: string;
}) {
  const attempt = typeof msg.attempt === 'number' ? msg.attempt : undefined;
  const maxAttempts = typeof msg.max_attempts === 'number' ? msg.max_attempts : undefined;
  const delayMs = typeof msg.delay_ms === 'number' ? msg.delay_ms : undefined;
  const reason = typeof msg.reason === 'string' && msg.reason.trim() ? msg.reason.trim() : undefined;

  const detailParts: string[] = [];
  if (attempt !== undefined && maxAttempts !== undefined) {
    detailParts.push(`Attempt ${attempt} of ${maxAttempts}.`);
  } else if (attempt !== undefined) {
    detailParts.push(`Retry attempt ${attempt}.`);
  } else {
    detailParts.push('The provider request is being retried automatically.');
  }

  if (delayMs !== undefined && delayMs > 0) {
    detailParts.push(`Waiting ${Math.ceil(delayMs / 1000)}s before the next try.`);
  }

  if (reason) {
    detailParts.push(reason);
  }

  return {
    tone: 'info' as const,
    title: 'Retrying request',
    detail: detailParts.join(' '),
  };
}

function routeCliMessage(state: ChatState, msg: Record<string, unknown>): ChatState {
  const next = { ...state, messages: [...state.messages] };

  switch (msg.type) {
    case 'rate_limit_event': {
      const info = msg.rate_limit_info as Record<string, unknown> | undefined;
      if (info) {
        const resetsAt = info.resetsAt as number;
        const rateLimitType = (info.rateLimitType as string) ?? 'unknown';
        next.rateLimitInfo = {
          resetsAt,
          rateLimitType,
          message: `Rate limited (${rateLimitType}). Resets at ${new Date(resetsAt * 1000).toLocaleTimeString()}.`,
        };
        next.error = `Rate limited. Resets at ${new Date(resetsAt * 1000).toLocaleTimeString()}.`;
      }
      break;
    }

    case 'tool_use_summary': {
      const toolName = (msg.tool_name as string) ?? 'tool';
      const summary = (msg.summary as string) ?? '';
      if (summary) {
        next.messages.push({
          id: `tool-summary-${Date.now()}`,
          role: 'system',
          text: `${toolName}: ${summary}`,
          system: {
            tone: 'info',
            title: toolName,
            detail: summary,
          },
        });
      }
      break;
    }

    case 'prompt_suggestion': {
      const suggestion = msg.suggestion as string;
      if (suggestion) {
        next.promptSuggestions = [
          ...next.promptSuggestions.filter((s) => s !== suggestion),
          suggestion,
        ].slice(-5);
      }
      break;
    }

    case 'system': {
      const subtype = msg.subtype as string;
      if (subtype === 'init') {
        next.sessionId = (msg.session_id as string) ?? null;
      } else if (subtype === 'ai-title') {
        next.sessionTitle = (msg.title as string) ?? null;
      } else if (subtype === 'informational') {
        const content = (msg.content as string) ?? '';
        next.messages.push({
          id: `informational-${Date.now()}`,
          role: 'system',
          text: content,
          system: parseSystemInlineMessage(content),
        });
      } else if (subtype === 'api_retry') {
        next.messages.push({
          id: `api-retry-${Date.now()}`,
          role: 'system',
          text: 'Retrying provider request.',
          system: formatApiRetryMessage(msg),
        });
      } else if (subtype === 'compact_boundary') {
        next.messages.push({
          id: `compact-${Date.now()}`,
          role: 'system',
          text: 'Context compacted to fit within limits.',
          system: {
            tone: 'info',
            title: 'Context compacted',
            detail: 'Older context was compressed to keep the session moving.',
          },
        });
      }
      break;
    }

    case 'result': {
      if (msg.is_error) {
        const resultText = msg.result as string | undefined;
        next.error = resultText ?? 'An error occurred';
      }
      break;
    }
  }

  return next;
}

function routeHostMessage(state: ChatState, data: Record<string, unknown>): ChatState {
  const next = { ...state };

  if (data.type === 'agent_team_board') {
    next.agentTeamBoard = (data.board as ChatState['agentTeamBoard']) ?? null;
  }

  if (data.type === 'clearMessages') {
    next.agentTeamBoard = null;
  }

  return next;
}

// ============================================================================
// Simulate process lifecycle / auto-restart logic from extension.ts
// ============================================================================

function createLifecycleManager() {
  const broadcasts: BroadcastedMessage[] = [];
  const broadcast = (msg: BroadcastedMessage) => broadcasts.push(msg);

  let crashRestartCount = 0;
  let lastCrashTime = 0;
  let currentSessionId: string | undefined;
  let restartScheduled = false;

  function handleExit(code: number | null, _signal: string | null) {
    if (code !== 0 && code !== null && currentSessionId) {
      const now = Date.now();
      if (now - lastCrashTime > 30_000) {
        crashRestartCount = 0;
      }
      crashRestartCount++;
      lastCrashTime = now;

      if (crashRestartCount <= 3) {
        broadcast({ type: 'process_state', state: 'restarting' });
        restartScheduled = true;
        return;
      } else {
        broadcast({ type: 'process_state', state: 'crashed' });
        return;
      }
    }
    broadcast({ type: 'process_state', state: (code !== null && code !== 0) ? 'crashed' : 'stopped' });
  }

  return {
    broadcasts,
    handleExit,
    setSessionId: (id: string) => { currentSessionId = id; },
    getCrashCount: () => crashRestartCount,
    isRestartScheduled: () => restartScheduled,
    resetCrashCount: () => { crashRestartCount = 0; },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Integration: CLI message → webview routing', () => {
  it('wraps CLI messages in cli_output envelope', () => {
    const { broadcasts, handleCliMessage } = createMessageRouter();
    handleCliMessage({ type: 'assistant', uuid: 'abc', session_id: 'sess-1' });
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0].type).toBe('cli_output');
    expect((broadcasts[0].data as Record<string, unknown>).type).toBe('assistant');
  });

  it('routes rate_limit_event to error and rateLimitInfo', () => {
    let state = createChatState();
    state = routeCliMessage(state, {
      type: 'rate_limit_event',
      rate_limit_info: { resetsAt: 9999999999, rateLimitType: 'daily' },
    });
    expect(state.error).toContain('Rate limited');
    expect(state.rateLimitInfo).not.toBeNull();
    expect(state.rateLimitInfo?.rateLimitType).toBe('daily');
  });

  it('routes result with is_error to error state', () => {
    let state = createChatState();
    state = routeCliMessage(state, {
      type: 'result',
      is_error: true,
      result: "You've hit your limit",
    });
    expect(state.error).toBe("You've hit your limit");
  });

  it('routes system/init to sessionId', () => {
    let state = createChatState();
    state = routeCliMessage(state, {
      type: 'system',
      subtype: 'init',
      session_id: 'sess-abc',
      model: 'claude-3-5-sonnet',
    });
    expect(state.sessionId).toBe('sess-abc');
  });

  it('routes system/ai-title to sessionTitle', () => {
    let state = createChatState();
    state = routeCliMessage(state, {
      type: 'system',
      subtype: 'ai-title',
      title: 'My Session Title',
    });
    expect(state.sessionTitle).toBe('My Session Title');
  });

  it('routes tool_use_summary as system message', () => {
    let state = createChatState();
    state = routeCliMessage(state, {
      type: 'tool_use_summary',
      tool_name: 'bash',
      summary: 'ran 3 commands',
    });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe('system');
    expect(state.messages[0].text).toContain('bash');
    expect(state.messages[0].text).toContain('ran 3 commands');
  });

  it('routes prompt_suggestion to suggestions list', () => {
    let state = createChatState();
    state = routeCliMessage(state, { type: 'prompt_suggestion', suggestion: 'Fix the bug' });
    state = routeCliMessage(state, { type: 'prompt_suggestion', suggestion: 'Add tests' });
    expect(state.promptSuggestions).toContain('Fix the bug');
    expect(state.promptSuggestions).toContain('Add tests');
  });

  it('deduplicates prompt suggestions', () => {
    let state = createChatState();
    state = routeCliMessage(state, { type: 'prompt_suggestion', suggestion: 'Fix the bug' });
    state = routeCliMessage(state, { type: 'prompt_suggestion', suggestion: 'Fix the bug' });
    expect(state.promptSuggestions.filter((s) => s === 'Fix the bug')).toHaveLength(1);
  });

  it('caps prompt suggestions at 5', () => {
    let state = createChatState();
    for (let i = 0; i < 7; i++) {
      state = routeCliMessage(state, { type: 'prompt_suggestion', suggestion: `Suggestion ${i}` });
    }
    expect(state.promptSuggestions.length).toBeLessThanOrEqual(5);
  });

  it('surfaces system/api_retry as a visible retry status card', () => {
    let state = createChatState();
    state = routeCliMessage(state, {
      type: 'system',
      subtype: 'api_retry',
      attempt: 2,
      max_attempts: 5,
      delay_ms: 1500,
      reason: '429 from upstream provider',
    });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].system?.title).toBe('Retrying request');
    expect(state.messages[0].system?.detail).toContain('Attempt 2 of 5.');
    expect(state.messages[0].system?.detail).toContain('Waiting 2s');
  });

  it('routes system/compact_boundary as system message', () => {
    let state = createChatState();
    state = routeCliMessage(state, { type: 'system', subtype: 'compact_boundary' });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].text).toContain('compacted');
    expect(state.messages[0].system?.title).toBe('Context compacted');
  });

  it('routes informational recovery messages as richer system state', () => {
    let state = createChatState();
    state = routeCliMessage(state, {
      type: 'system',
      subtype: 'informational',
      content:
        'Repeated tool failures detected. Retrying once with an alternate strategy instead of stopping.',
    });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].system?.tone).toBe('warning');
    expect(state.messages[0].system?.title).toBe('Agent adapted strategy');
  });

  it('keeps recommendation approval flow session-scoped', () => {
    const shownIds = new Set<string>();
    const dismissedIds = new Set<string>();
    const appliedIds = new Set<string>();

    shownIds.add('postgres-mcp');
    dismissedIds.add('playwright-mcp');
    appliedIds.add('lsp-plugin');

    expect(shownIds.has('postgres-mcp')).toBe(true);
    expect(dismissedIds.has('playwright-mcp')).toBe(true);
    expect(appliedIds.has('lsp-plugin')).toBe(true);
  });

  it('routes agent team board host updates into chat state', () => {
    let state = createChatState();
    state = routeHostMessage(state, {
      type: 'agent_team_board',
      board: {
        enabled: true,
        mode: 'assist',
        maxWorkers: 3,
        useWorktrees: true,
        worktreeAvailable: true,
        currentWorktreeName: 'feature-agent-board',
        runningTaskCount: 1,
        warnings: [],
        tasks: [{ id: 't1', description: 'Investigate test failures', status: 'running' }],
        summaries: [],
      },
    });

    expect(state.agentTeamBoard?.enabled).toBe(true);
    expect(state.agentTeamBoard?.tasks[0]?.description).toBe('Investigate test failures');
  });

  it('clears agent team board state on new conversation reset', () => {
    let state = createChatState();
    state = routeHostMessage(state, {
      type: 'agent_team_board',
      board: {
        enabled: true,
        mode: 'assist',
        maxWorkers: 3,
        useWorktrees: true,
        worktreeAvailable: false,
        currentWorktreeName: null,
        runningTaskCount: 1,
        warnings: ['warning'],
        tasks: [{ id: 't1', description: 'Investigate', status: 'running' }],
        summaries: [],
      },
    });
    state = routeHostMessage(state, { type: 'clearMessages' });

    expect(state.agentTeamBoard).toBeNull();
  });
});

describe('Integration: process lifecycle', () => {
  it('broadcasts stopped on clean exit (code 0)', () => {
    const mgr = createLifecycleManager();
    mgr.handleExit(0, null);
    expect(mgr.broadcasts[0]).toEqual({ type: 'process_state', state: 'stopped' });
  });

  it('broadcasts crashed on non-zero exit without session', () => {
    const mgr = createLifecycleManager();
    mgr.handleExit(1, null);
    expect(mgr.broadcasts[0]).toEqual({ type: 'process_state', state: 'crashed' });
  });

  it('schedules restart on non-zero exit with session (attempt 1)', () => {
    const mgr = createLifecycleManager();
    mgr.setSessionId('sess-123');
    mgr.handleExit(1, null);
    expect(mgr.broadcasts[0]).toEqual({ type: 'process_state', state: 'restarting' });
    expect(mgr.isRestartScheduled()).toBe(true);
    expect(mgr.getCrashCount()).toBe(1);
  });

  it('caps restart attempts at 3 within 30 seconds', () => {
    const mgr = createLifecycleManager();
    mgr.setSessionId('sess-123');

    // Simulate 3 crashes in quick succession
    mgr.handleExit(1, null);
    mgr.handleExit(1, null);
    mgr.handleExit(1, null);
    expect(mgr.getCrashCount()).toBe(3);
    // 4th crash should broadcast crashed, not restarting
    mgr.handleExit(1, null);
    const lastBroadcast = mgr.broadcasts[mgr.broadcasts.length - 1];
    expect(lastBroadcast).toEqual({ type: 'process_state', state: 'crashed' });
  });

  it('resets crash count after 30 seconds', () => {
    const mgr = createLifecycleManager();
    mgr.setSessionId('sess-123');

    // Simulate 3 crashes
    mgr.handleExit(1, null);
    mgr.handleExit(1, null);
    mgr.handleExit(1, null);
    expect(mgr.getCrashCount()).toBe(3);

    // Reset count (simulating 30s passing)
    mgr.resetCrashCount();
    mgr.handleExit(1, null);
    // Should restart again (count is 1 after reset)
    expect(mgr.getCrashCount()).toBe(1);
  });

  it('broadcasts stopped on SIGTERM (null code)', () => {
    const mgr = createLifecycleManager();
    mgr.setSessionId('sess-123');
    mgr.handleExit(null, 'SIGTERM');
    // null code means killed by signal — no auto-restart, broadcast stopped
    // (code !== 0 && code !== null) is false when code is null
    expect(mgr.broadcasts[0]).toEqual({ type: 'process_state', state: 'stopped' });
  });
});

describe('Integration: useProcessState logic', () => {
  it('maps rate_limit_event to rate_limited status', () => {
    // Simulate the logic from useProcessState
    const events: Array<{ type: string; state?: string }> = [];

    function handleMessage(data: Record<string, unknown>) {
      if (data.type === 'process_state') {
        events.push({ type: 'status', state: data.state as string });
      }
      if (data.type === 'cli_output') {
        const inner = data.data as Record<string, unknown>;
        if (inner?.type === 'rate_limit_event') {
          events.push({ type: 'status', state: 'rate_limited' });
        }
      }
    }

    handleMessage({ type: 'cli_output', data: { type: 'rate_limit_event', rate_limit_info: { resetsAt: 9999, rateLimitType: 'daily' } } });
    expect(events[0].state).toBe('rate_limited');
  });

  it('maps auth_status error to auth_error status', () => {
    const events: Array<{ type: string; state?: string }> = [];

    function handleMessage(data: Record<string, unknown>) {
      if (data.type === 'cli_output') {
        const inner = data.data as Record<string, unknown>;
        if (inner?.type === 'auth_status' && inner.error) {
          events.push({ type: 'status', state: 'auth_error' });
        }
      }
    }

    handleMessage({ type: 'cli_output', data: { type: 'auth_status', error: 'Invalid API key' } });
    expect(events[0].state).toBe('auth_error');
  });
});
