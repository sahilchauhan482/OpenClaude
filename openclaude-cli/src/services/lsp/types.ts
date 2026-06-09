export interface LspServerConfig {
  command: string;
  args?: string[];
  extensionToLanguage: Record<string, string>;
  transport?: 'stdio' | 'socket';
  env?: Record<string, string>;
  initializationOptions?: unknown;
  settings?: unknown;
  workspaceFolder?: string;
  startupTimeout?: number;
  shutdownTimeout?: number;
  restartOnCrash?: boolean;
  maxRestarts?: number;
}

export interface ScopedLspServerConfig extends LspServerConfig {
  scope: 'dynamic' | 'static';
  source: string;
}

export type LspServerState = 'starting' | 'running' | 'failed' | 'stopped' | 'stopped-by-config' | 'error' | 'stopping'
