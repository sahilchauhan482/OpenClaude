import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import {
  BlackboxBridge,
  DEFAULT_BLACKBOX_MODEL,
  normalizeBlackboxModel,
} from '../../src/providers/blackboxBridge';

describe('BlackboxBridge', () => {
  const callbacks = new Map<string, (...args: unknown[]) => unknown>();
  let output: vscode.OutputChannel;

  beforeEach(() => {
    callbacks.clear();
    output = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      appendLine: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    } as unknown as vscode.OutputChannel;

    vi.spyOn(vscode.commands, 'registerCommand').mockImplementation((command, callback) => {
      callbacks.set(command, callback as (...args: unknown[]) => unknown);
      return { dispose: vi.fn() };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes the two free Blackbox model names', () => {
    expect(normalizeBlackboxModel()).toBe(DEFAULT_BLACKBOX_MODEL);
    expect(normalizeBlackboxModel('Minimax M2.7')).toBe('minimax-m2');
    expect(normalizeBlackboxModel('Kimi K2.6')).toBe('moonshotai/kimi-k2.6');
  });

  it('sends requests through the Blackbox command bridge', async () => {
    const events: unknown[] = [];
    vi.spyOn(vscode.commands, 'executeCommand').mockImplementation(async (command, payload) => {
      if (command === 'blackbox.checkLLMCapability') return true;
      if (command === 'blackbox.handleLLMRequest') {
        const request = payload as { requestId: string; modelSelection: { modelName: string } };
        callbacks.get('blackbox.llmResponse')?.({
          requestId: request.requestId,
          type: 'final',
          content: 'hello from blackbox',
        });
        return undefined;
      }
      return undefined;
    });

    const bridge = new BlackboxBridge(output);
    await bridge.sendMessage({
      text: 'Hello',
      model: 'Kimi K2.6',
      onEvent: (event) => events.push(event),
    });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'blackbox.handleLLMRequest',
      expect.objectContaining({
        messages: [{ role: 'user', content: 'Hello' }],
        modelSelection: {
          providerName: 'moonshotai/kimi-k2.6',
          modelName: 'moonshotai/kimi-k2.6',
        },
      }),
    );
    expect(events).toContainEqual(expect.objectContaining({
      type: 'final',
      content: 'hello from blackbox',
    }));
  });
});
