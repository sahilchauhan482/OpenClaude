export type UiPermissionMode = 'default' | 'plan' | 'fullAccess';

export type HostPermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'fullAccess' | 'plan' | 'dontAsk';

export interface PermissionModeConfig {
  label: string;
  description: string;
  color: string;
}

const CONFIG: Record<UiPermissionMode, PermissionModeConfig> = {
  default: {
    label: 'Default',
    description: 'Ask before each tool use',
    color: 'var(--vscode-charts-blue, #4fc3f7)',
  },
  plan: {
    label: 'Plan',
    description: 'Review plan before execution',
    color: 'var(--vscode-charts-purple, #ce93d8)',
  },
  fullAccess: {
    label: 'Full Access',
    description: 'Auto-approve everything',
    color: 'var(--vscode-charts-red, #ef9a9a)',
  },
};

export function toHostPermissionMode(mode: UiPermissionMode): HostPermissionMode {
  if (mode === 'fullAccess') {
    return 'fullAccess';
  }
  return mode;
}

export function fromHostPermissionMode(mode: HostPermissionMode | string | undefined | null): UiPermissionMode {
  if (mode === 'plan' || mode === 'default') {
    return mode;
  }
  return 'fullAccess';
}

export function getPermissionModeConfig(mode: UiPermissionMode): PermissionModeConfig {
  return CONFIG[mode] ?? CONFIG.default;
}
