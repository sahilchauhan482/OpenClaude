import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getConfiguration, update } = vi.hoisted(() => ({
  getConfiguration: vi.fn(),
  update: vi.fn(),
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration,
  },
  ConfigurationTarget: {
    Global: 1,
  },
}));

import { SettingsSync } from '../../src/settings/settingsSync';

describe('SettingsSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConfiguration.mockReturnValue({
      get: vi.fn((key: string, fallback: unknown) => {
        if (key === 'initialPermissionMode') return fallback;
        return fallback;
      }),
      update,
    });
  });

  it('normalizes dontAsk to default when reading initialPermissionMode', () => {
    getConfiguration.mockReturnValue({
      get: vi.fn((key: string, fallback: unknown) => {
        if (key === 'initialPermissionMode') return 'dontAsk';
        return fallback;
      }),
      update,
    });

    const settings = new SettingsSync();

    expect(settings.initialPermissionMode).toBe('default');
  });

  it('persists dontAsk as default when writing initialPermissionMode', async () => {
    const settings = new SettingsSync();

    await settings.setInitialPermissionMode('dontAsk' as never);

    expect(update).toHaveBeenCalledWith(
      'initialPermissionMode',
      'default',
      1,
    );
  });

  it('dedupes hook policy packs before persisting', async () => {
    const settings = new SettingsSync();

    await settings.setHookPolicyPacks([
      'safe-default',
      'safe-default',
      'enterprise-audit',
    ]);

    expect(update).toHaveBeenCalledWith(
      'hookPolicyPacks',
      ['safe-default', 'enterprise-audit'],
      1,
    );
  });

  it('normalizes agent team max workers to bounded integer range', () => {
    getConfiguration.mockReturnValue({
      get: vi.fn((key: string, fallback: unknown) => {
        if (key === 'agentTeamMaxWorkers') return 22.4;
        return fallback;
      }),
      update,
    });

    const settings = new SettingsSync();

    expect(settings.agentTeamMaxWorkers).toBe(8);
  });
});
