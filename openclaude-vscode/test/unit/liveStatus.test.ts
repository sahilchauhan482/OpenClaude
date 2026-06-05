import { describe, it, expect } from 'vitest';
import { getLiveStatus } from '../../webview/src/utils/liveStatus';

describe('getLiveStatus', () => {
  it('returns null while streaming without tool activity', () => {
    expect(getLiveStatus(null, true)).toBeNull();
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
      headline: 'Running command',
      detail: 'Running: npm test',
      ticker: 'Running live',
    });
  });

  it('returns null when not streaming', () => {
    expect(getLiveStatus({ toolName: 'bash', description: 'Running: npm test' }, false)).toBeNull();
  });
});
