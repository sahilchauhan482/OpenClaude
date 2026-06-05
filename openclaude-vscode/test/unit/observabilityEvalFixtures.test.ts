import { describe, expect, it } from 'vitest';
import { createTranscriptEvalFixture } from '../../src/observability/evalFixtures';
import { buildObservabilitySnapshotFromEvents } from '../../src/observability/eventLog';
import { buildToolPlaybackFixtures } from '../../src/observability/uiPlaybackFixtures';

describe('observability eval fixtures', () => {
  it('creates stable transcript-to-eval fixtures with assertions and playback data', () => {
    const transcriptMessages = [
      {
        type: 'user',
        uuid: 'user-1',
        timestamp: '2026-06-04T10:00:00.000Z',
        message: {
          role: 'user',
          content: 'Run the targeted tests and explain the failure',
        },
      },
      {
        type: 'assistant',
        uuid: 'assistant-1',
        timestamp: '2026-06-04T10:00:10.000Z',
        message: {
          role: 'assistant',
          model: 'gpt-5',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: {
                command: 'npm test -- --run test/unit/sessionDiscovery.test.ts',
              },
            },
            {
              type: 'tool_result',
              tool_use_id: 'tool-1',
              content: [
                {
                  type: 'text',
                  text: ['### Check: targeted tests', '**Command run:**', 'npm test -- --run test/unit/sessionDiscovery.test.ts', 'VERDICT: PASS'].join('\n'),
                },
              ],
            },
          ],
        },
      },
    ] satisfies Array<Record<string, unknown>>;

    const snapshot = buildObservabilitySnapshotFromEvents([
      {
        id: 'evt-1',
        sessionId: 'sess-1',
        timestamp: '2026-06-04T10:00:00.000Z',
        source: 'webview',
        category: 'user',
        kind: 'host_prompt_submitted',
        summary: 'Prompt submitted',
        payload: {},
      },
      {
        id: 'evt-2',
        sessionId: 'sess-1',
        timestamp: '2026-06-04T10:00:01.000Z',
        source: 'host',
        category: 'process',
        kind: 'host_process_state_changed',
        summary: 'Process state changed to running',
        payload: { state: 'running' },
      },
      {
        id: 'evt-3',
        sessionId: 'sess-1',
        timestamp: '2026-06-04T10:00:10.000Z',
        source: 'cli',
        category: 'assistant',
        kind: 'cli_turn_result',
        summary: 'Turn completed successfully',
        payload: {},
      },
    ], 'sess-1');

    const fixture = createTranscriptEvalFixture({
      transcriptMessages,
      observability: snapshot,
      playbackFixtures: buildToolPlaybackFixtures(transcriptMessages),
    });

    expect(fixture.schemaVersion).toBe(1);
    expect(fixture.prompt.userMessages[0]?.text).toContain('Run the targeted tests');
    expect(fixture.prompt.assistantMessages[0]?.blockCount).toBe(2);
    expect(fixture.playback.tools[0]?.presentationKind).toBe('command');
    expect(fixture.playback.tools[0]?.verification?.verdict).toBe('PASS');
    expect(fixture.assertions.completionComplete).toBe(true);
    expect(fixture.assertions.eventKinds).toContain('host_prompt_submitted');
  });
});
