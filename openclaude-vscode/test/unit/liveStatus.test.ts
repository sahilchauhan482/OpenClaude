import { describe, it, expect } from 'vitest';
import { getLiveStatus } from '../../webview/src/utils/liveStatus';

describe('getLiveStatus', () => {
  it('returns a thinking status while streaming without tool activity', () => {
    expect(getLiveStatus(null, true)).toEqual({
      kind: 'thinking',
      label: 'Thinking...',
      detail: 'Working through the next response',
    });
  });

  it('returns tool activity details while streaming', () => {
    expect(
      getLiveStatus(
        { toolName: 'bash', description: 'Running: npm test' },
        true,
      ),
    ).toEqual({
      kind: 'tool',
      label: 'bash',
      detail: 'Running: npm test',
    });
  });

  it('returns null when not streaming', () => {
    expect(getLiveStatus({ toolName: 'bash', description: 'Running: npm test' }, false)).toBeNull();
  });
});
