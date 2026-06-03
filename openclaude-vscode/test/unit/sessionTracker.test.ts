import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionTracker } from '../../src/session/sessionTracker';

/**
 * Tests for SessionTracker parsing and grouping logic.
 *
 * We test the pure logic by writing JSONL files to a temp directory,
 * then verifying parsing behavior. Full VS Code integration tests
 * (FileSystemWatcher, WebviewViewProvider) require the extension host.
 */

describe('SessionTracker — JSONL parsing', () => {
  const testDir = path.join(os.tmpdir(), 'openclaude-session-test-' + Date.now());
  const projectDir = path.join(testDir, '-test-project');

  beforeEach(() => {
    fs.mkdirSync(projectDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function writeJsonl(id: string, lines: object[]): string {
    const filePath = path.join(projectDir, `${id}.jsonl`);
    fs.writeFileSync(filePath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    return filePath;
  }

  it('should produce valid JSONL that can be parsed line by line', () => {
    const filePath = writeJsonl('session-001', [
      {
        type: 'user',
        message: { role: 'user', content: 'Hello world' },
        timestamp: '2026-04-02T10:00:00.000Z',
        uuid: 'msg-1',
        sessionId: 'session-001',
        cwd: '/test',
        gitBranch: 'main',
        isMeta: false,
      },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi there!' }],
          model: 'gpt-5.4',
        },
        timestamp: '2026-04-02T10:00:05.000Z',
        uuid: 'msg-2',
        sessionId: 'session-001',
      },
    ]);

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]);
    expect(first.type).toBe('user');
    expect(first.message.content).toBe('Hello world');

    const second = JSON.parse(lines[1]);
    expect(second.type).toBe('assistant');
    expect(second.message.model).toBe('gpt-5.4');
  });

  it('should skip meta messages when counting', () => {
    writeJsonl('session-002', [
      {
        type: 'user',
        message: { role: 'user', content: 'Real message' },
        timestamp: '2026-04-02T10:00:00.000Z',
        isMeta: false,
      },
      {
        type: 'user',
        message: { role: 'user', content: [{ type: 'tool_result', content: 'tool output' }] },
        timestamp: '2026-04-02T10:00:01.000Z',
        isMeta: true,
      },
      {
        type: 'file-history-snapshot',
        messageId: 'msg-x',
        snapshot: {},
      },
    ]);

    const content = fs.readFileSync(path.join(projectDir, 'session-002.jsonl'), 'utf-8');
    const lines = content
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    const countable = lines.filter((l) => l.type === 'user' && !l.isMeta);
    expect(countable).toHaveLength(1);
  });

  it('should prefer ai-title over first user message for session title', () => {
    const lines = [
      {
        type: 'user',
        message: { role: 'user', content: 'Fallback title from user prompt' },
        timestamp: '2026-04-02T10:00:00.000Z',
        isMeta: false,
      },
      {
        type: 'system',
        subtype: 'ai-title',
        title: 'AI Generated Title',
        timestamp: '2026-04-02T10:00:10.000Z',
      },
    ];

    // Simulate the extraction priority logic from SessionTracker.parseSessionFile
    let title = '';
    let fallbackTitle = '';
    for (const entry of lines) {
      if (entry.type === 'user' && !entry.isMeta && !fallbackTitle) {
        const content =
          typeof entry.message?.content === 'string' ? entry.message.content : '';
        if (content && !content.startsWith('<command-name>')) {
          fallbackTitle = content.slice(0, 120);
        }
      }
      if (entry.type === 'system' && entry.subtype === 'ai-title' && entry.title) {
        title = entry.title;
      }
    }
    const finalTitle = title || fallbackTitle || 'Untitled Session';
    expect(finalTitle).toBe('AI Generated Title');
  });

  it('should fall back to first user message when no ai-title exists', () => {
    const lines = [
      {
        type: 'user',
        message: { role: 'user', content: 'Fix the websocket reconnect bug' },
        timestamp: '2026-04-02T10:00:00.000Z',
        isMeta: false,
      },
      {
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Sure!' }], model: 'gpt-5.4' },
        timestamp: '2026-04-02T10:00:05.000Z',
      },
    ];

    let fallbackTitle = '';
    for (const entry of lines) {
      if (entry.type === 'user' && !entry.isMeta && !fallbackTitle) {
        const content =
          typeof entry.message?.content === 'string' ? entry.message.content : '';
        if (content) fallbackTitle = content.slice(0, 120);
      }
    }
    expect(fallbackTitle).toBe('Fix the websocket reconnect bug');
  });

  it('should skip command messages as fallback titles', () => {
    const lines = [
      {
        type: 'user',
        message: { role: 'user', content: '<command-name>/provider</command-name>' },
        timestamp: '2026-04-02T10:00:00.000Z',
        isMeta: false,
      },
      {
        type: 'user',
        message: { role: 'user', content: 'Now fix the bug' },
        timestamp: '2026-04-02T10:00:01.000Z',
        isMeta: false,
      },
    ];

    let fallbackTitle = '';
    for (const entry of lines) {
      if (entry.type === 'user' && !entry.isMeta && !fallbackTitle) {
        const content =
          typeof entry.message?.content === 'string' ? entry.message.content : '';
        if (content && !content.startsWith('<command-name>') && !content.startsWith('<local-command')) {
          fallbackTitle = content.slice(0, 120);
        }
      }
    }
    expect(fallbackTitle).toBe('Now fix the bug');
  });
});

describe('SessionTracker — time grouping', () => {
  it('should place sessions into correct time buckets', () => {
    const now = new Date();
    const todayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    const yesterdayNoon = new Date(todayNoon.getTime() - 86_400_000);
    const threeDaysAgo = new Date(todayNoon.getTime() - 3 * 86_400_000);
    const fifteenDaysAgo = new Date(todayNoon.getTime() - 15 * 86_400_000);
    const sixtyDaysAgo = new Date(todayNoon.getTime() - 60 * 86_400_000);

    const timestamps = [todayNoon, yesterdayNoon, threeDaysAgo, fifteenDaysAgo, sixtyDaysAgo];

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
    const weekStart = new Date(todayStart.getTime() - 7 * 86_400_000);
    const monthStart = new Date(todayStart.getTime() - 30 * 86_400_000);

    const buckets: Record<string, Date[]> = {
      'Today': [],
      'Yesterday': [],
      'This Week': [],
      'This Month': [],
      'Older': [],
    };

    for (const ts of timestamps) {
      const t = ts.getTime();
      if (t >= todayStart.getTime()) buckets['Today'].push(ts);
      else if (t >= yesterdayStart.getTime()) buckets['Yesterday'].push(ts);
      else if (t >= weekStart.getTime()) buckets['This Week'].push(ts);
      else if (t >= monthStart.getTime()) buckets['This Month'].push(ts);
      else buckets['Older'].push(ts);
    }

    expect(buckets['Today']).toHaveLength(1);
    expect(buckets['Yesterday']).toHaveLength(1);
    expect(buckets['This Week']).toHaveLength(1);
    expect(buckets['This Month']).toHaveLength(1);
    expect(buckets['Older']).toHaveLength(1);
  });

  it('should sort sessions newest first within each bucket', () => {
    const sessions = [
      { timestamp: new Date('2026-04-02T08:00:00Z') },
      { timestamp: new Date('2026-04-02T12:00:00Z') },
      { timestamp: new Date('2026-04-02T10:00:00Z') },
    ];

    const sorted = [...sessions].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );

    expect(sorted[0].timestamp.toISOString()).toBe('2026-04-02T12:00:00.000Z');
    expect(sorted[1].timestamp.toISOString()).toBe('2026-04-02T10:00:00.000Z');
    expect(sorted[2].timestamp.toISOString()).toBe('2026-04-02T08:00:00.000Z');
  });
});

describe('SessionTracker — search', () => {
  it('should match sessions by title substring', () => {
    const sessions = [
      { title: 'Fix websocket reconnect bug', model: 'gpt-5.4', gitBranch: 'main' },
      { title: 'Add auth middleware', model: 'claude-sonnet', gitBranch: 'feat/auth' },
      { title: 'Refactor API layer', model: 'gpt-5.4', gitBranch: 'main' },
    ];

    const query = 'auth';
    const results = sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(query) ||
        s.model.toLowerCase().includes(query) ||
        s.gitBranch.toLowerCase().includes(query),
    );

    // Matches "Add auth middleware" by title (and also by gitBranch "feat/auth")
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Add auth middleware');
  });

  it('should match sessions by model name', () => {
    const sessions = [
      { title: 'Session A', model: 'gpt-5.4', gitBranch: 'main' },
      { title: 'Session B', model: 'claude-sonnet', gitBranch: 'main' },
    ];

    const query = 'claude';
    const results = sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(query) ||
        s.model.toLowerCase().includes(query) ||
        s.gitBranch.toLowerCase().includes(query),
    );

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Session B');
  });
});

describe('SessionTracker — codex transcript ids', () => {
  const testDir = path.join(os.tmpdir(), 'openclaude-codex-session-' + Date.now());
  const sessionDir = path.join(testDir, '2026', '06', '01');

  beforeEach(() => {
    fs.mkdirSync(sessionDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should use the session id from transcript metadata instead of the filename', async () => {
    const transcriptPath = path.join(
      sessionDir,
      'rollout-2026-06-01T10-15-00-019e82f5-5793-7263-874f-008dda434d9d.jsonl',
    );
    const sessionId = '019e82f5-5793-7263-874f-008dda434d9d';

    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          timestamp: '2026-06-01T10:15:00.000Z',
          type: 'session_meta',
          payload: {
            id: sessionId,
            cwd: 'D:\\SKUVelocity',
            source: 'vscode',
            model_provider: 'openai',
          },
        }),
        JSON.stringify({
          timestamp: '2026-06-01T10:15:01.000Z',
          type: 'turn_context',
          payload: {
            turn_id: 'turn-1',
            cwd: 'D:\\SKUVelocity',
            current_date: '2026-06-01',
            timezone: 'Asia/Calcutta',
            model: 'gpt-5.4-mini',
          },
        }),
        JSON.stringify({
          timestamp: '2026-06-01T10:15:02.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'Hello from Codex' }],
          },
        }),
        JSON.stringify({
          timestamp: '2026-06-01T10:15:03.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Hi there' }],
          },
        }),
      ].join('\n') + '\n',
    );

    const tracker = new SessionTracker();
    await tracker.parseSessionFile(transcriptPath);

    const session = tracker.getSession(sessionId);
    expect(session).toBeTruthy();
    expect(session?.id).toBe(sessionId);
    expect(session?.title).toBe('Hello from Codex');
    expect(session?.model).toBe('gpt-5.4-mini');
    expect(session?.provider).toBe('codex');
    expect(session?.cwd).toBe('D:\\SKUVelocity');
    expect(await tracker.loadSessionMessages(sessionId)).toHaveLength(2);
  });

  it('should replay direct Codex user and assistant transcript entries', async () => {
    const transcriptPath = path.join(
      sessionDir,
      'rollout-2026-06-01T11-00-00-019e82f5-5793-7263-874f-008dda434d9d.jsonl',
    );
    const sessionId = '019e82f5-5793-7263-874f-008dda434d9d';

    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          timestamp: '2026-06-01T11:00:00.000Z',
          type: 'session_meta',
          payload: {
            id: sessionId,
            cwd: 'D:\\SKUVelocity',
            source: 'vscode',
            model_provider: 'openai',
          },
        }),
        JSON.stringify({
          timestamp: '2026-06-01T11:00:01.000Z',
          type: 'turn_context',
          payload: {
            turn_id: 'turn-1',
            cwd: 'D:\\SKUVelocity',
            current_date: '2026-06-01',
            timezone: 'Asia/Calcutta',
            model: 'gpt-5.4-mini',
          },
        }),
        JSON.stringify({
          timestamp: '2026-06-01T11:00:02.000Z',
          type: 'user',
          message: {
            role: 'user',
            content: 'Inspect the supplier screen',
          },
          uuid: 'user-1',
          sessionId,
        }),
        JSON.stringify({
          timestamp: '2026-06-01T11:00:03.000Z',
          type: 'assistant',
          message: {
            role: 'assistant',
            model: 'claude-opus-4-7',
            content: [{ type: 'text', text: 'Let me inspect it.' }],
          },
          uuid: 'assistant-1',
          sessionId,
        }),
      ].join('\n') + '\n',
    );

    const tracker = new SessionTracker();
    await tracker.parseSessionFile(transcriptPath);

    const messages = await tracker.loadSessionMessages(sessionId);
    expect(messages).toHaveLength(2);
    expect(messages[0].type).toBe('user');
    expect(messages[1].type).toBe('assistant');
  });

  it('should prefer the latest explicit model seen in the transcript', async () => {
    const transcriptPath = path.join(
      sessionDir,
      'rollout-2026-06-01T11-30-00-019e82f5-5793-7263-874f-008dda434d9d.jsonl',
    );
    const sessionId = '019e82f5-5793-7263-874f-008dda434d9d';

    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          timestamp: '2026-06-01T11:30:00.000Z',
          type: 'session_meta',
          payload: {
            id: sessionId,
            cwd: 'D:\\SKUVelocity',
            source: 'vscode',
            model_provider: 'openai',
          },
        }),
        JSON.stringify({
          timestamp: '2026-06-01T11:30:01.000Z',
          type: 'turn_context',
          payload: {
            turn_id: 'turn-1',
            cwd: 'D:\\SKUVelocity',
            current_date: '2026-06-01',
            timezone: 'Asia/Calcutta',
            model: 'gpt-5.5',
          },
        }),
        JSON.stringify({
          timestamp: '2026-06-01T11:30:02.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'First reply' }],
          },
        }),
        JSON.stringify({
          timestamp: '2026-06-01T11:30:03.000Z',
          type: 'turn_context',
          payload: {
            turn_id: 'turn-2',
            cwd: 'D:\\SKUVelocity',
            current_date: '2026-06-01',
            timezone: 'Asia/Calcutta',
            model: 'gemma-4-31b-it',
          },
        }),
        JSON.stringify({
          timestamp: '2026-06-01T11:30:04.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Second reply' }],
          },
        }),
      ].join('\n') + '\n',
    );

    const tracker = new SessionTracker();
    await tracker.parseSessionFile(transcriptPath);

    const session = tracker.getSession(sessionId);
    expect(session).toBeTruthy();
    expect(session?.model).toBe('gemma-4-31b-it');
  });

  it('should ignore <synthetic> model placeholders when resolving the session model', async () => {
    const transcriptPath = path.join(
      sessionDir,
      'rollout-2026-06-01T12-00-00-019e82f5-5793-7263-874f-008dda434d9d.jsonl',
    );
    const sessionId = '019e82f5-5793-7263-874f-008dda434d9d';

    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          timestamp: '2026-06-01T12:00:00.000Z',
          type: 'session_meta',
          payload: {
            id: sessionId,
            cwd: 'D:\\SKUVelocity',
            source: 'vscode',
            model_provider: 'openai',
          },
        }),
        JSON.stringify({
          timestamp: '2026-06-01T12:00:01.000Z',
          type: 'turn_context',
          payload: {
            turn_id: 'turn-1',
            cwd: 'D:\\SKUVelocity',
            current_date: '2026-06-01',
            timezone: 'Asia/Calcutta',
            model: '<synthetic>',
          },
        }),
        JSON.stringify({
          timestamp: '2026-06-01T12:00:02.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Synthetic stub' }],
          },
        }),
        JSON.stringify({
          timestamp: '2026-06-01T12:00:03.000Z',
          type: 'turn_context',
          payload: {
            turn_id: 'turn-2',
            cwd: 'D:\\SKUVelocity',
            current_date: '2026-06-01',
            timezone: 'Asia/Calcutta',
            model: 'gpt-5.5',
          },
        }),
        JSON.stringify({
          timestamp: '2026-06-01T12:00:04.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Real reply' }],
          },
        }),
      ].join('\n') + '\n',
    );

    const tracker = new SessionTracker();
    await tracker.parseSessionFile(transcriptPath);

    const session = tracker.getSession(sessionId);
    expect(session).toBeTruthy();
    expect(session?.model).toBe('gpt-5.5');
  });
});

describe('SessionTracker — OpenClaude transcript root', () => {
  const projectsDir = path.join(
    os.homedir(),
    '.openclaude',
    'projects',
    'D--openclaude-vscode',
  );
  const transcriptPath = path.join(projectsDir, `openclaude-session-${Date.now()}.jsonl`);

  beforeEach(() => {
    fs.mkdirSync(projectsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(transcriptPath, { force: true });
  });

  it('should include sessions from ~/.openclaude/projects', async () => {
    const sessionId = `openclaude-session-${Date.now()}`;
    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          type: 'user',
          message: { role: 'user', content: 'OpenClaude session hello' },
          timestamp: '2026-06-02T10:00:00.000Z',
          uuid: 'user-1',
          sessionId,
          cwd: os.homedir(),
          gitBranch: 'main',
          isMeta: false,
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello from OpenClaude' }],
            model: 'gpt-5.5',
          },
          timestamp: '2026-06-02T10:00:05.000Z',
          uuid: 'assistant-1',
          sessionId,
        }),
      ].join('\n') + '\n',
    );

    const tracker = new SessionTracker();
    await tracker.scanAllSessions();

    const session = tracker.getSession(sessionId);
    expect(session).toBeTruthy();
    expect(session?.title).toBe('OpenClaude session hello');
    expect(session?.model).toBe('gpt-5.5');
    expect(session?.messageCount).toBe(2);
    expect(session?.cwd).toBe(os.homedir());
  }, 15_000);
});
