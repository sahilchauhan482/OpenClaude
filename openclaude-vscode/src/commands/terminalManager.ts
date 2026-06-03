import * as vscode from 'vscode';
import { resolveCliExecutable } from '../settings/cliExecutable';
import type { AuthManager } from '../auth/authManager';
import { resolveNearestGitRepositoryPath } from '../context/workspaceContext';

/**
 * Manages the OpenClaude integrated terminal instance.
 * When terminal mode is enabled, spawns the CLI in VS Code's terminal
 * instead of the webview panel.
 */
export class TerminalManager implements vscode.Disposable {
  private terminal: vscode.Terminal | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly authManager: AuthManager) {
    this.disposables.push(
      vscode.window.onDidCloseTerminal((closed) => {
        if (closed === this.terminal) {
          this.terminal = undefined;
        }
      }),
    );
  }

  /**
   * Open or focus the OpenClaude terminal.
   * If a terminal already exists, just reveals it.
   */
  open(): void {
    if (this.terminal) {
      this.terminal.show();
      return;
    }

    const config = vscode.workspace.getConfiguration('openclaudeCode');
    const cliCommand = resolveCliExecutable(config);
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const activeFilePath = vscode.window.activeTextEditor?.document?.fileName;
    const cwd =
      resolveNearestGitRepositoryPath(activeFilePath) ??
      resolveNearestGitRepositoryPath(workspacePath) ??
      workspacePath;

    const env = this.authManager.buildProcessEnv();

    this.terminal = vscode.window.createTerminal({
      name: 'OpenClaude',
      cwd,
      env,
      iconPath: new vscode.ThemeIcon('sparkle'),
    });

    const flags: string[] = [];
    const model = this.authManager.getCliModel(config.get<string>('selectedModel', 'default'));
    if (model && model !== 'default') {
      flags.push('--model', model);
    }
    const provider = this.authManager.getCliProvider();
    if (provider) {
      flags.push('--provider', provider);
    }
    const rawPermMode = config.get<string>('initialPermissionMode', 'default');
    const permMode = rawPermMode === 'dontAsk' ? 'default' : rawPermMode;
    if (permMode && permMode !== 'default') {
      flags.push('--permission-mode', permMode);
    }
    if (config.get<boolean>('allowDangerouslySkipPermissions', false)) {
      flags.push('--allow-dangerously-skip-permissions');
    }

    this.terminal.sendText([cliCommand, ...flags].join(' '));
    this.terminal.show();
  }

  dispose(): void {
    this.terminal?.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
