import { describe, expect, it } from 'vitest';
import { getProviderStateModel } from '../../webview/src/utils/providerState';

describe('providerState', () => {
  it('returns the trimmed current model when provided', () => {
    expect(getProviderStateModel({ currentModel: '  gemma-4-31b-it  ' })).toBe('gemma-4-31b-it');
  });

  it('returns null for empty or non-string models', () => {
    expect(getProviderStateModel({ currentModel: '   ' })).toBeNull();
    expect(getProviderStateModel({ currentModel: 42 })).toBeNull();
  });
});
