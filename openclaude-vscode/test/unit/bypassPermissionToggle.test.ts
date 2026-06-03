import { describe, expect, it, vi } from 'vitest';
import { syncBypassPermissionToggle } from '../../src/permissions/bypassPermissionToggle';

describe('syncBypassPermissionToggle', () => {
  it('persists the bypass setting and rebroadcasts the current mode', async () => {
    const setAllowDangerouslySkipPermissions = vi.fn().mockResolvedValue(undefined);
    const setPermissionMode = vi.fn();
    const getCurrentPermissionMode = vi.fn().mockReturnValue('dontAsk');

    const result = await syncBypassPermissionToggle(
      {
        setAllowDangerouslySkipPermissions,
        getCurrentPermissionMode,
        setPermissionMode,
      },
      true,
    );

    expect(setAllowDangerouslySkipPermissions).toHaveBeenCalledWith(true);
    expect(setPermissionMode).toHaveBeenCalledWith('bypassPermissions');
    expect(result).toEqual({
      bypassEnabled: true,
      mode: 'bypassPermissions',
      requiresRestart: true,
    });
  });

  it('downgrades bypass mode to default when the safety setting is disabled', async () => {
    const setAllowDangerouslySkipPermissions = vi.fn().mockResolvedValue(undefined);
    const setPermissionMode = vi.fn();
    const getCurrentPermissionMode = vi.fn().mockReturnValue('bypassPermissions');

    const result = await syncBypassPermissionToggle(
      {
        setAllowDangerouslySkipPermissions,
        getCurrentPermissionMode,
        setPermissionMode,
      },
      false,
    );

    expect(setAllowDangerouslySkipPermissions).toHaveBeenCalledWith(false);
    expect(setPermissionMode).toHaveBeenCalledWith('default');
    expect(result).toEqual({
      bypassEnabled: false,
      mode: 'default',
      requiresRestart: true,
    });
  });

  it('does not request a restart when the active mode already matches the toggle state', async () => {
    const setAllowDangerouslySkipPermissions = vi.fn().mockResolvedValue(undefined);
    const setPermissionMode = vi.fn();
    const getCurrentPermissionMode = vi.fn().mockReturnValue('bypassPermissions');

    const result = await syncBypassPermissionToggle(
      {
        setAllowDangerouslySkipPermissions,
        getCurrentPermissionMode,
        setPermissionMode,
      },
      true,
    );

    expect(setAllowDangerouslySkipPermissions).toHaveBeenCalledWith(true);
    expect(setPermissionMode).toHaveBeenCalledWith('bypassPermissions');
    expect(result.requiresRestart).toBe(false);
  });

  it('downgrades fullAccess to default when dangerous mode is disabled', async () => {
    const setAllowDangerouslySkipPermissions = vi.fn().mockResolvedValue(undefined);
    const setPermissionMode = vi.fn();
    const getCurrentPermissionMode = vi.fn().mockReturnValue('fullAccess');

    const result = await syncBypassPermissionToggle(
      {
        setAllowDangerouslySkipPermissions,
        getCurrentPermissionMode,
        setPermissionMode,
      },
      false,
    );

    expect(setAllowDangerouslySkipPermissions).toHaveBeenCalledWith(false);
    expect(setPermissionMode).toHaveBeenCalledWith('default');
    expect(result).toEqual({
      bypassEnabled: false,
      mode: 'default',
      requiresRestart: true,
    });
  });
});
