import { describe, expect, it } from 'vitest';
import {
  fromHostPermissionMode,
  toHostPermissionMode,
} from '../../webview/src/utils/permissionMode';

describe('permissionModeUi', () => {
  it('maps full access to fullAccess for the host runtime', () => {
    expect(toHostPermissionMode('fullAccess')).toBe('fullAccess');
  });

  it('maps host auto-approve modes back to full access in the UI', () => {
    expect(fromHostPermissionMode('fullAccess')).toBe('fullAccess');
    expect(fromHostPermissionMode('dontAsk')).toBe('fullAccess');
    expect(fromHostPermissionMode('bypassPermissions')).toBe('fullAccess');
    expect(fromHostPermissionMode('acceptEdits')).toBe('fullAccess');
  });

  it('keeps default and plan modes unchanged', () => {
    expect(fromHostPermissionMode('default')).toBe('default');
    expect(fromHostPermissionMode('plan')).toBe('plan');
    expect(toHostPermissionMode('default')).toBe('default');
    expect(toHostPermissionMode('plan')).toBe('plan');
  });
});
