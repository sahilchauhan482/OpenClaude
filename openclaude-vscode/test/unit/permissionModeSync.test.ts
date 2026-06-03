import { describe, expect, it } from 'vitest';
import { shouldForwardPermissionModeToCli } from '../../src/permissions/permissionModeSync';

describe('shouldForwardPermissionModeToCli', () => {
  it('forwards mode changes when a process is available even if the host mode already matches', () => {
    expect(
      shouldForwardPermissionModeToCli(true, 'dontAsk', 'dontAsk'),
    ).toBe(true);
  });

  it('does not forward when no process is running', () => {
    expect(
      shouldForwardPermissionModeToCli(false, 'bypassPermissions', 'default'),
    ).toBe(false);
  });
});
