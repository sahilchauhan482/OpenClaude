import { describe, expect, it } from 'vitest';
import {
  buildOutgoingUserMessage,
  resolveOutgoingSessionId,
  resolveSessionIdForSpawn,
} from '../../src/session/sessionBinding';

describe('resolveOutgoingSessionId', () => {
  it('prefers the active resumed session id over the process session id', () => {
    expect(resolveOutgoingSessionId('resume-123', 'fresh-999')).toBe('resume-123');
  });

  it('falls back to the process session id when there is no active resumed session', () => {
    expect(resolveOutgoingSessionId(undefined, 'fresh-999')).toBe('fresh-999');
  });
});

describe('buildOutgoingUserMessage', () => {
  it('stamps the session id on the top-level user envelope', () => {
    expect(buildOutgoingUserMessage('hello', 'resume-123')).toEqual({
      type: 'user',
      session_id: 'resume-123',
      message: {
        role: 'user',
        content: 'hello',
      },
    });
  });

  it('omits session id when none is available', () => {
    expect(buildOutgoingUserMessage('hello')).toEqual({
      type: 'user',
      message: {
        role: 'user',
        content: 'hello',
      },
    });
  });
});

describe('resolveSessionIdForSpawn', () => {
  it('prefers the active resumed session id when spawning a process', () => {
    expect(resolveSessionIdForSpawn('resume-123', 'fresh-999')).toBe('resume-123');
  });

  it('falls back to the requested session id when there is no active session', () => {
    expect(resolveSessionIdForSpawn(undefined, 'fresh-999')).toBe('fresh-999');
  });
});
