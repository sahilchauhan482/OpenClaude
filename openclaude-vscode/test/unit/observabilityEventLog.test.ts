import { describe, expect, it } from 'vitest';
import {
  buildObservabilitySnapshotFromEvents,
  normalizeCliObservabilityEvent,
  ObservabilityEventLog,
} from '../../src/observability/eventLog';

describe('observability event log', () => {
  it('normalizes delegation and recovery CLI messages into structured events', () => {
    const taskStarted = normalizeCliObservabilityEvent({
      type: 'system',
      subtype: 'task_started',
      session_id: 'sess-1',
      task_id: 'task-1',
      description: 'Investigate session resume bug',
      task_type: 'analysis',
    });
    const apiRetry = normalizeCliObservabilityEvent({
      type: 'system',
      subtype: 'api_retry',
      session_id: 'sess-1',
      attempt: 2,
      max_retries: 5,
      retry_delay_ms: 500,
      error_status: 429,
    });

    expect(taskStarted?.category).toBe('delegation');
    expect(taskStarted?.kind).toBe('cli_task_started');
    expect(apiRetry?.category).toBe('recovery');
    expect(apiRetry?.kind).toBe('cli_api_retry');
  });

  it('tracks completeness for prompt/turn/delegation flows', () => {
    const log = new ObservabilityEventLog();
    log.record({
      sessionId: 'sess-1',
      source: 'webview',
      category: 'user',
      kind: 'host_prompt_submitted',
      summary: 'Prompt submitted',
    });
    log.record({
      sessionId: 'sess-1',
      source: 'host',
      category: 'process',
      kind: 'host_process_state_changed',
      summary: 'Process started',
    });
    log.record({
      sessionId: 'sess-1',
      source: 'cli',
      category: 'delegation',
      kind: 'cli_task_started',
      summary: 'Worker started',
    });
    log.record({
      sessionId: 'sess-1',
      source: 'cli',
      category: 'delegation',
      kind: 'cli_task_notification',
      summary: 'Worker completed',
    });
    log.record({
      sessionId: 'sess-1',
      source: 'cli',
      category: 'assistant',
      kind: 'cli_turn_result',
      summary: 'Turn completed',
    });

    const snapshot = log.snapshot('sess-1');

    expect(snapshot.totalEvents).toBe(5);
    expect(snapshot.countsByCategory.delegation).toBe(2);
    expect(snapshot.completeness.isComplete).toBe(true);
    expect(snapshot.completeness.missingKinds).toEqual([]);
  });

  it('rebinds early pending events onto the resolved session id', () => {
    const log = new ObservabilityEventLog();
    log.record({
      sessionId: null,
      source: 'host',
      category: 'process',
      kind: 'host_process_state_changed',
      summary: 'Process starting',
    });
    log.rebindSession(null, 'sess-42');

    const snapshot = buildObservabilitySnapshotFromEvents(log.getEvents('sess-42'), 'sess-42');

    expect(snapshot.totalEvents).toBe(1);
    expect(snapshot.events[0]?.sessionId).toBe('sess-42');
  });
});
