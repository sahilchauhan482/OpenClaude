import type { PermissionMode } from '../types/session';

export interface BypassPermissionToggleDependencies {
  setAllowDangerouslySkipPermissions(enabled: boolean): Promise<void>;
  getCurrentPermissionMode(): PermissionMode;
  setPermissionMode(mode: PermissionMode): void;
}

/**
 * Persist the bypass-permissions safety setting and keep the UI/runtime mode in sync.
 *
 * When bypass is disabled while currently active, we downgrade to default mode
 * so the runtime cannot remain in an unsafe state.
 */
export async function syncBypassPermissionToggle(
  deps: BypassPermissionToggleDependencies,
  enabled: boolean,
): Promise<{ bypassEnabled: boolean; mode: PermissionMode; requiresRestart: boolean }> {
  await deps.setAllowDangerouslySkipPermissions(enabled);

  const currentMode = deps.getCurrentPermissionMode();
  const nextMode: PermissionMode = enabled
    ? (currentMode === 'fullAccess' ? 'fullAccess' : 'bypassPermissions')
    : currentMode === 'bypassPermissions' || currentMode === 'fullAccess'
      ? 'default'
      : currentMode;

  deps.setPermissionMode(nextMode);

  return {
    bypassEnabled: enabled,
    mode: nextMode,
    requiresRestart: nextMode !== currentMode,
  };
}
