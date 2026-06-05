// src/settings/settingsSync.ts
// Wrapper around vscode.workspace.getConfiguration('openclaudeCode') for provider settings.

import * as vscode from 'vscode';
import type { PermissionMode } from '../types/session';

export interface ProviderProfile {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  providerOptions?: Record<string, string>;
}

export type HookPolicyPackId =
  | 'safe-default'
  | 'codebase-strict'
  | 'auto-format-and-test'
  | 'enterprise-audit';

export type AgentTeamMode = 'off' | 'assist' | 'coordinate';

export class SettingsSync {
  private get config() {
    return vscode.workspace.getConfiguration('openclaudeCode');
  }

  private static readonly PERMISSION_MODES = new Set<PermissionMode>([
    'default',
    'acceptEdits',
    'plan',
    'bypassPermissions',
    'fullAccess',
  ]);

  get selectedProvider(): string {
    return this.config.get<string>('selectedProvider', 'anthropic');
  }

  get selectedModel(): string | undefined {
    const v = this.config.get<string>('selectedModel');
    return v && v !== 'default' ? v : undefined;
  }

  get apiKey(): string | undefined {
    return this.config.get<string>('apiKey') || undefined;
  }

  get baseUrl(): string | undefined {
    return this.config.get<string>('baseUrl') || undefined;
  }

  get providerOptions(): Record<string, string> {
    return this.config.get<Record<string, string>>('providerOptions', {});
  }

  get providerProfiles(): Record<string, ProviderProfile> {
    return this.config.get<Record<string, ProviderProfile>>('providerProfiles', {});
  }

  get environmentVariables(): Array<{ name: string; value: string }> {
    return this.config.get<Array<{ name: string; value: string }>>('environmentVariables', []);
  }

  get initialPermissionMode(): PermissionMode {
    const raw = this.config.get<string>('initialPermissionMode', 'default');
    if (raw === 'dontAsk') return 'default';
    return SettingsSync.PERMISSION_MODES.has(raw as PermissionMode)
      ? (raw as PermissionMode)
      : 'default';
  }

  async setProvider(providerId: string): Promise<void> {
    await this.config.update('selectedProvider', providerId, vscode.ConfigurationTarget.Global);
  }

  async setModel(model: string | undefined): Promise<void> {
    await this.config.update('selectedModel', model ?? 'default', vscode.ConfigurationTarget.Global);
  }

  async setApiKey(apiKey: string | undefined): Promise<void> {
    await this.config.update('apiKey', apiKey ?? '', vscode.ConfigurationTarget.Global);
  }

  async setBaseUrl(baseUrl: string | undefined): Promise<void> {
    await this.config.update('baseUrl', baseUrl ?? '', vscode.ConfigurationTarget.Global);
  }

  async setProviderOptions(providerOptions: Record<string, string> | undefined): Promise<void> {
    await this.config.update('providerOptions', providerOptions ?? {}, vscode.ConfigurationTarget.Global);
  }

  getProviderProfile(providerId: string): ProviderProfile | undefined {
    return this.providerProfiles[providerId];
  }

  async setProviderProfile(providerId: string, profile: ProviderProfile | undefined): Promise<void> {
    const nextProfiles = {
      ...this.providerProfiles,
    };
    if (profile) {
      nextProfiles[providerId] = {
        apiKey: profile.apiKey,
        baseUrl: profile.baseUrl,
        model: profile.model,
        providerOptions: profile.providerOptions ?? {},
      };
    } else {
      delete nextProfiles[providerId];
    }
    await this.config.update('providerProfiles', nextProfiles, vscode.ConfigurationTarget.Global);
  }

  async setAllowDangerouslySkipPermissions(enabled: boolean): Promise<void> {
    await this.config.update('allowDangerouslySkipPermissions', enabled, vscode.ConfigurationTarget.Global);
  }

  async setInitialPermissionMode(mode: PermissionMode): Promise<void> {
    const normalizedMode = mode === 'dontAsk' ? 'default' : mode;
    await this.config.update('initialPermissionMode', normalizedMode, vscode.ConfigurationTarget.Global);
  }

  get hookPolicyPacks(): HookPolicyPackId[] {
    return this.config.get<HookPolicyPackId[]>('hookPolicyPacks', []);
  }

  async setHookPolicyPacks(packs: HookPolicyPackId[]): Promise<void> {
    await this.config.update(
      'hookPolicyPacks',
      Array.from(new Set(packs)),
      vscode.ConfigurationTarget.Global,
    );
  }

  get agentTeamMode(): AgentTeamMode {
    const raw = this.config.get<string>('agentTeamMode', 'off');
    return raw === 'assist' || raw === 'coordinate' ? raw : 'off';
  }

  get agentTeamMaxWorkers(): number {
    const raw = this.config.get<number>('agentTeamMaxWorkers', 3);
    if (!Number.isFinite(raw)) return 3;
    return Math.min(8, Math.max(1, Math.round(raw)));
  }

  get agentTeamUseWorktrees(): boolean {
    return this.config.get<boolean>('agentTeamUseWorktrees', true);
  }

  async setAgentTeamMode(mode: AgentTeamMode): Promise<void> {
    await this.config.update('agentTeamMode', mode, vscode.ConfigurationTarget.Global);
  }

  async setAgentTeamMaxWorkers(maxWorkers: number): Promise<void> {
    const normalized = Math.min(8, Math.max(1, Math.round(maxWorkers)));
    await this.config.update('agentTeamMaxWorkers', normalized, vscode.ConfigurationTarget.Global);
  }

  async setAgentTeamUseWorktrees(enabled: boolean): Promise<void> {
    await this.config.update('agentTeamUseWorktrees', enabled, vscode.ConfigurationTarget.Global);
  }
}
