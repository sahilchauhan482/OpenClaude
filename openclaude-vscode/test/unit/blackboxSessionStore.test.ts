import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { BlackboxSessionStore } from '../../src/session/blackboxSessionStore';

function createMockContext() {
  const workspaceState = {
    get: vi.fn((_key, defaultValue) => defaultValue),
    update: vi.fn().mockResolvedValue(undefined),
  };

  return {
    workspaceState,
  } as unknown as vscode.ExtensionContext;
}

describe('BlackboxSessionStore', () => {
  const workspaceFolders = [{ uri: vscode.Uri.file('D:/work/project') }];
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    context = createMockContext();
    (vscode.workspace as { workspaceFolders: typeof workspaceFolders }).workspaceFolders = workspaceFolders;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (vscode.workspace as { workspaceFolders: typeof workspaceFolders }).workspaceFolders = [];
  });

  it('stores messages, persists sessions, and rebuilds resume payloads', () => {
    const store = new BlackboxSessionStore(context);
    const session = store.startSession('bb-1', 'minimax-m2', 'UI review');
    expect(session.cwd).toBe('D:/work/project');

    store.appendUserMessage('bb-1', 'Please review this screenshot', 'minimax-m2');
    store.appendAssistantMessage('bb-1', 'Looks good.');

    const saved = store.getSession('bb-1');
    expect(saved?.messageCount).toBe(2);
    expect(saved?.messages).toHaveLength(2);
    expect(saved?.messages[0]).toEqual(
      expect.objectContaining({ role: 'user', content: 'Please review this screenshot' }),
    );
    expect(saved?.messages[1]).toEqual(
      expect.objectContaining({ role: 'assistant', content: 'Looks good.' }),
    );

    const replay = store.loadSessionMessages('bb-1');
    expect(replay).toHaveLength(2);
    expect(replay[0]).toEqual(
      expect.objectContaining({
        type: 'user',
        session_id: 'bb-1',
        message: expect.objectContaining({ role: 'user', content: 'Please review this screenshot' }),
      }),
    );
    expect(replay[1]).toEqual(
      expect.objectContaining({
        type: 'assistant',
        session_id: 'bb-1',
        message: expect.objectContaining({
          role: 'assistant',
          content: expect.arrayContaining([
            expect.objectContaining({ type: 'text', text: 'Looks good.' }),
          ]),
        }),
      }),
    );
  });

  it('deletes sessions from the store', () => {
    const store = new BlackboxSessionStore(context);
    store.startSession('bb-2', 'minimax-m2');
    expect(store.deleteSession('bb-2')).toBe(true);
    expect(store.getSession('bb-2')).toBeUndefined();
  });
});
