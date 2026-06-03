import { describe, expect, it, vi } from 'vitest';
import {
  inferProviderFromModel,
  resolveResumeProvider,
  resolveResumeWorkspaceContext,
  resolveResumeSessionContext,
  resumeSessionWithoutBlocking,
} from '../../src/session/sessionResume';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('resumeSessionWithoutBlocking', () => {
  it('starts the process before waiting for history to load', async () => {
    const events: string[] = [];
    const history = deferred<Array<Record<string, unknown>>>();

    const { historyPromise } = await resumeSessionWithoutBlocking({
      prepare: () => events.push('prepare'),
      loadHistory: () => {
        events.push('loadHistory');
        return history.promise;
      },
      spawn: async () => {
        events.push('spawn');
      },
    });

    await vi.waitFor(() => {
      expect(events).toContain('spawn');
    });
    expect(events).toEqual(['prepare', 'loadHistory', 'spawn']);

    history.resolve([{ type: 'assistant' }]);
    const messages = await historyPromise;

    expect(messages).toHaveLength(1);
    expect(events).toEqual(['prepare', 'loadHistory', 'spawn']);
  });

  it('drops late history if the session is no longer active', async () => {
    const history = deferred<Array<Record<string, unknown>>>();

    const { historyPromise } = await resumeSessionWithoutBlocking({
      prepare: vi.fn(),
      loadHistory: () => history.promise,
      spawn: async () => undefined,
    });

    history.resolve([{ type: 'assistant' }]);
    await expect(historyPromise).resolves.toHaveLength(1);
  });
});

describe('resolveResumeSessionContext', () => {
  it('prefers the session cwd over the active workspace and preserves the session model', () => {
    const context = resolveResumeSessionContext(
      {
        cwd: 'C:\\Users\\USER\\.openclaude',
        model: 'gpt-5.5',
      } as never,
      {
        cwd: 'D:\\SKUVelocity',
        model: 'gemma-4-31b-it',
      },
    );

    expect(context.cwd).toBe('C:\\Users\\USER\\.openclaude');
    expect(context.model).toBe('gpt-5.5');
  });

  it('falls back to the active workspace when the session has no usable cwd or model', () => {
    const context = resolveResumeSessionContext(
      {
        cwd: '   ',
        model: 'unknown',
      } as never,
      {
        cwd: 'D:\\SKUVelocity',
        model: 'gemma-4-31b-it',
      },
    );

    expect(context.cwd).toBe('D:\\SKUVelocity');
    expect(context.model).toBe('gemma-4-31b-it');
  });
});

describe('inferProviderFromModel', () => {
  it('maps Gemini-family models to the Gemini provider', () => {
    expect(inferProviderFromModel('gemma-4-31b-it')).toBe('gemini');
    expect(inferProviderFromModel('gemini-1.5-pro')).toBe('gemini');
  });

  it('maps GPT-family models to the Codex provider', () => {
    expect(inferProviderFromModel('gpt-5.5')).toBe('codex');
    expect(inferProviderFromModel('o3-mini')).toBe('codex');
  });

  it('maps Claude-family models to the Anthropic provider', () => {
    expect(inferProviderFromModel('claude-opus-4-7')).toBe('anthropic');
    expect(inferProviderFromModel('sonnet-4')).toBe('anthropic');
  });

  it('returns undefined for unknown models', () => {
    expect(inferProviderFromModel('')).toBeUndefined();
    expect(inferProviderFromModel('unknown-model')).toBeUndefined();
  });
});

describe('resolveResumeProvider', () => {
  it('prefers an explicitly saved session provider', () => {
    expect(
      resolveResumeProvider(
        { provider: 'anthropic' } as never,
        'codex',
      ),
    ).toBe('anthropic');
  });

  it('keeps the current provider when the session has no explicit provider', () => {
    expect(
      resolveResumeProvider(
        {
          model: 'gpt-5.5',
        } as never,
        'freemodel',
      ),
    ).toBe('freemodel');
  });
});

describe('resolveResumeWorkspaceContext', () => {
  it('keeps the saved session cwd when resuming an existing conversation', () => {
    const context = resolveResumeWorkspaceContext(
      {
        cwd: 'C:\\Users\\USER\\.claude',
      } as never,
      {
        cwd: 'D:\\SKUVelocity',
        model: 'gpt-5.5',
      },
    );

    expect(context.workspacePath).toBe('C:\\Users\\USER\\.claude');
    expect(context.gitRootPath).toBe('C:\\Users\\USER\\.claude');
    expect(context.isGitRepository).toBe(false);
  });
});
