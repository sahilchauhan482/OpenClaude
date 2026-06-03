import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getConfiguration, showWarningMessage } = vi.hoisted(() => ({
  getConfiguration: vi.fn(),
  showWarningMessage: vi.fn(),
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration,
  },
  window: {
    showWarningMessage,
  },
}));

import { PermissionHandler } from '../../src/permissions/permissionHandler';

function makeHandler(allowBypass: boolean) {
  getConfiguration.mockReturnValue({
    get: vi.fn((key: string, fallback: unknown) => {
      if (key === 'allowDangerouslySkipPermissions') return allowBypass;
      return fallback;
    }),
  });

  const broadcast = vi.fn();
  const onMessage = vi.fn().mockReturnValue({ dispose: vi.fn() });
  const output = { appendLine: vi.fn() } as never;
  const rules = { has: vi.fn().mockReturnValue(false), add: vi.fn() } as never;
  const handler = new PermissionHandler(
    { broadcast, onMessage } as never,
    rules,
    output,
  );

  return { handler, broadcast, output };
}

describe('PermissionHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects bypass mode when the safety setting is disabled', () => {
    const { handler, broadcast } = makeHandler(false);

    expect(handler.setMode('bypassPermissions')).toBe(false);

    expect(handler.getMode()).toBe('default');
    expect(showWarningMessage).toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'permission_mode_rejected',
        requestedMode: 'bypassPermissions',
        currentMode: 'default',
      }),
    );
  });

  it('accepts bypass mode when the safety setting is enabled', () => {
    const { handler, broadcast } = makeHandler(true);

    expect(handler.setMode('bypassPermissions')).toBe(true);

    expect(handler.getMode()).toBe('bypassPermissions');
    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'permission_mode_changed',
        mode: 'bypassPermissions',
        bypassEnabled: true,
      }),
    );
  });

  it('throws when CLI requests a bypass mode change while the safety setting is disabled', () => {
    const { handler } = makeHandler(false);

    expect(() =>
      handler.handleSetPermissionMode({ mode: 'fullAccess' } as never),
    ).toThrow('Permission mode change rejected: fullAccess');
  });
});
