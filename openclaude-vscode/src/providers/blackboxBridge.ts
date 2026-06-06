import * as vscode from 'vscode';

export interface BlackboxModelInfo {
  value: string;
  displayName: string;
}

export const BLACKBOX_FREE_MODELS: BlackboxModelInfo[] = [
  { value: 'minimax-m2', displayName: 'Minimax M2.7' },
  { value: 'moonshotai/kimi-k2.6', displayName: 'Kimi K2.6' },
];

export const DEFAULT_BLACKBOX_MODEL = BLACKBOX_FREE_MODELS[0].value;

export interface BlackboxChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BlackboxResponseEvent {
  requestId: string;
  type: 'text' | 'reasoning' | 'usage' | 'final' | 'error';
  content?: string;
  deltaContent?: string;
  reasoning?: string;
  deltaReasoning?: string;
  error?: string;
  usage?: Record<string, unknown>;
}

export interface BlackboxSendOptions {
  text: string;
  model?: string;
  systemMessage?: string;
  onEvent: (event: BlackboxResponseEvent) => void;
}

export function normalizeBlackboxModel(model?: string): string {
  const trimmed = model?.trim();
  if (!trimmed) return DEFAULT_BLACKBOX_MODEL;
  const exact = BLACKBOX_FREE_MODELS.find((m) => m.value === trimmed);
  if (exact) return exact.value;

  const lower = trimmed.toLowerCase();
  if (lower.includes('kimi')) return 'moonshotai/kimi-k2.6';
  if (lower.includes('minimax')) return 'minimax-m2';
  return DEFAULT_BLACKBOX_MODEL;
}

export class BlackboxBridge implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly activeRequests = new Map<string, BlackboxSendOptions>();
  private readonly history: BlackboxChatMessage[] = [];
  private responseCommandRegistered = false;

  readonly sessionId = `blackbox-${Date.now().toString(36)}`;

  constructor(private readonly output: vscode.OutputChannel) {
    try {
      const disposable = vscode.commands.registerCommand(
        'blackbox.llmResponse',
        (event: BlackboxResponseEvent) => this.handleResponse(event),
      );
      this.disposables.push(disposable);
      this.responseCommandRegistered = true;
    } catch (err) {
      this.output.appendLine(`[Blackbox][WARN] Could not register response command: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  reset(): void {
    this.history.length = 0;
  }

  hydrateHistory(messages: BlackboxChatMessage[]): void {
    this.history.length = 0;
    this.history.push(...messages);
  }

  getHistory(): BlackboxChatMessage[] {
    return [...this.history];
  }

  async isAvailable(): Promise<boolean> {
    if (!this.responseCommandRegistered) return false;
    try {
      return (await vscode.commands.executeCommand<boolean>('blackbox.checkLLMCapability')) === true;
    } catch (err) {
      this.output.appendLine(`[Blackbox][WARN] Capability check failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  async sendMessage(options: BlackboxSendOptions): Promise<string> {
    if (!this.responseCommandRegistered) {
      throw new Error('Blackbox response command is not available. Reload VS Code and try again.');
    }

    const available = await this.isAvailable();
    if (!available) {
      throw new Error('Blackbox Agent is not ready. Open the Blackbox panel once, then try again.');
    }

    const requestId = `openclaude-blackbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const modelName = normalizeBlackboxModel(options.model);
    const messages = [...this.history, { role: 'user' as const, content: options.text }];

    this.history.push({ role: 'user', content: options.text });
    this.activeRequests.set(requestId, options);

    await vscode.commands.executeCommand('blackbox.handleLLMRequest', {
      requestId,
      systemMessage: options.systemMessage ?? 'You are OpenClaude, a helpful AI coding assistant.',
      messages,
      modelSelection: {
        providerName: modelName,
        modelName,
      },
    });

    return requestId;
  }

  abortAll(): void {
    for (const requestId of this.activeRequests.keys()) {
      void vscode.commands.executeCommand('blackbox.abortLLMRequest', requestId);
    }
    this.activeRequests.clear();
  }

  dispose(): void {
    this.abortAll();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private handleResponse(event: BlackboxResponseEvent): void {
    const request = this.activeRequests.get(event.requestId);
    if (!request) return;

    request.onEvent(event);

    if (event.type === 'final') {
      this.history.push({ role: 'assistant', content: event.content ?? '' });
      this.activeRequests.delete(event.requestId);
    } else if (event.type === 'error') {
      this.activeRequests.delete(event.requestId);
    }
  }
}
