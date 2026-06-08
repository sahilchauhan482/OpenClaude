// src/auth/authManager.ts
// Provider definitions and env-var assembly for supported LLM backends.

import * as os from 'node:os';
import * as path from 'node:path';
import type { SettingsSync } from '../settings/settingsSync';
import type { ProviderProfile } from '../settings/settingsSync';

// ============================================================================
// Types
// ============================================================================

export interface ProviderDefinition {
  id: string;
  label: string;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  supportsModel: boolean;
  defaultBaseUrl?: string;
  fields?: ProviderField[];
}

export interface ProviderField {
  id: string;
  label: string;
  required: boolean;
  secret?: boolean;
  defaultValue?: string;
  placeholder?: string;
  description?: string;
}

export interface ProviderConfig {
  id: string;
  label: string;
  env: Record<string, string>;
  model?: string;
  fallbackApiKeys?: string[];
  providerOptions: Record<string, string>;
  cliProvider?: string;
}

export interface ProviderUpdateInput {
  providerId: string;
  apiKey?: string;
  fallbackApiKeys?: string[];
  baseUrl?: string;
  model?: string;
  providerOptions?: Record<string, string>;
}

export interface ProviderValidationResult {
  valid: boolean;
  errors: string[];
}

function isNvidiaNimBaseUrl(baseUrl: string | undefined): boolean {
  const normalized = baseUrl?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return normalized.startsWith('https://integrate.api.nvidia.com/');
}

function normalizeFallbackApiKeys(fallbackApiKeys: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const key of fallbackApiKeys ?? []) {
    const trimmed = key.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

// ============================================================================
// Provider definitions
// ============================================================================

const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModel: true,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModel: true,
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    requiresApiKey: false,
    requiresBaseUrl: false,
    supportsModel: true,
    defaultBaseUrl: 'http://localhost:11434/v1',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    requiresApiKey: true,
    requiresBaseUrl: true,
    supportsModel: true,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModel: true,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'codex',
    label: 'Codex (ChatGPT login)',
    requiresApiKey: false,
    requiresBaseUrl: false,
    supportsModel: true,
  },
  {
    id: 'bedrock',
    label: 'AWS Bedrock',
    requiresApiKey: false,
    requiresBaseUrl: false,
    supportsModel: true,
  },
  {
    id: 'vertex',
    label: 'Google Vertex AI',
    requiresApiKey: false,
    requiresBaseUrl: false,
    supportsModel: true,
    fields: [
      {
        id: 'vertexProjectId',
        label: 'Google Cloud Project ID',
        required: true,
        placeholder: 'my-gcp-project',
      },
      {
        id: 'vertexRegion',
        label: 'Region',
        required: false,
        defaultValue: 'us-east5',
        placeholder: 'us-east5',
      },
      {
        id: 'vertexCredentialsPath',
        label: 'Service Account JSON Path',
        required: false,
        placeholder: 'C:\\Users\\you\\keys\\vertex-service-account.json',
        description: 'Optional when Google ADC is already configured.',
      },
    ],
  },
  {
    id: 'freemodel',
    label: 'Freemodel (Claude-compatible)',
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModel: true,
    defaultBaseUrl: 'https://cc.freemodel.dev',
  },
  {
    id: 'codex-freemodel',
    label: 'Codex API (Freemodel)',
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModel: true,
    defaultBaseUrl: 'https://api.freemodel.dev',
  },
  {
    id: 'nvidia-nim',
    label: 'NVIDIA NIM',
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModel: true,
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
  },
  {
    id: 'blackbox',
    label: 'Blackbox (free via extension)',
    requiresApiKey: false,
    requiresBaseUrl: false,
    supportsModel: true,
  },
  {
    id: 'github',
    label: 'GitHub Models',
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModel: true,
  },
  {
    id: 'custom-anthropic',
    label: 'Custom (Claude-compatible)',
    requiresApiKey: true,
    requiresBaseUrl: true,
    supportsModel: true,
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    requiresApiKey: true,
    requiresBaseUrl: true,
    supportsModel: true,
  },
];

// ============================================================================
// AuthManager
// ============================================================================

export class AuthManager {
  constructor(private readonly settings: SettingsSync) {}

  getAvailableProviders(): ProviderDefinition[] {
    return PROVIDER_DEFINITIONS;
  }

  getCurrentProvider(): ProviderConfig {
    const providerId = this.settings.selectedProvider;
    const def = PROVIDER_DEFINITIONS.find((p) => p.id === providerId) ?? PROVIDER_DEFINITIONS[0];
    const rememberedProfile = this.settings.getProviderProfile(providerId);
    const apiKey = this.settings.apiKey ?? rememberedProfile?.apiKey;
    const fallbackApiKeys = normalizeFallbackApiKeys(
      this.settings.fallbackApiKeys.length > 0
        ? this.settings.fallbackApiKeys
        : rememberedProfile?.fallbackApiKeys,
    );
    const baseUrl = this.settings.baseUrl ?? rememberedProfile?.baseUrl;
    const model = this.settings.selectedModel ?? rememberedProfile?.model;
    const providerOptions = {
      ...(rememberedProfile?.providerOptions ?? {}),
      ...(this.settings.providerOptions ?? {}),
    };

    return {
      id: def.id,
      label: def.label,
      env: this._buildEnvForProvider(def, apiKey, fallbackApiKeys, baseUrl, providerOptions),
      model,
      fallbackApiKeys,
      providerOptions,
      cliProvider: this.getCliProviderForProvider(def.id),
    };
  }

  getCliProvider(): string | undefined {
    const providerId = this.settings.selectedProvider;
    const def = PROVIDER_DEFINITIONS.find((p) => p.id === providerId) ?? PROVIDER_DEFINITIONS[0];
    return this.getCliProviderForProvider(def.id);
  }

  /**
   * Build the env vars to inject into ProcessManager for the current provider.
   */
  buildProcessEnv(): Record<string, string> {
    const providerId = this.settings.selectedProvider;
    const def = PROVIDER_DEFINITIONS.find((p) => p.id === providerId) ?? PROVIDER_DEFINITIONS[0];
    const rememberedProfile = this.settings.getProviderProfile(providerId);
    const apiKey = this.settings.apiKey ?? rememberedProfile?.apiKey;
    const fallbackApiKeys = normalizeFallbackApiKeys(
      this.settings.fallbackApiKeys.length > 0
        ? this.settings.fallbackApiKeys
        : rememberedProfile?.fallbackApiKeys,
    );
    const baseUrl = this.settings.baseUrl ?? rememberedProfile?.baseUrl;
    const providerOptions = {
      ...(rememberedProfile?.providerOptions ?? {}),
      ...(this.settings.providerOptions ?? {}),
    };

    // Start with user-configured env vars
    const env: Record<string, string> = {};
    for (const { name, value } of this.settings.environmentVariables) {
      env[name] = value;
    }

    // Merge provider-specific env vars (provider takes precedence for its own keys)
    const providerEnv = this._buildEnvForProvider(def, apiKey, fallbackApiKeys, baseUrl, providerOptions);
    Object.assign(env, providerEnv);

    // Keep the VS Code extension isolated to OpenClaude-owned storage so
    // transcript history and resumes never bleed into legacy/shared tools.
    env.CLAUDE_CONFIG_DIR = path.join(os.homedir(), '.openclaude');

    return env;
  }

  async updateProvider(input: ProviderUpdateInput): Promise<void> {
    const previousProviderId = this.settings.selectedProvider;
    const previousProfile: ProviderProfile = {
      apiKey: this.settings.apiKey,
      fallbackApiKeys: this.settings.fallbackApiKeys,
      baseUrl: this.settings.baseUrl,
      model: this.settings.selectedModel,
      providerOptions: this.settings.providerOptions,
    };

    await this.settings.setProviderProfile(previousProviderId, previousProfile);
    await this.settings.setProvider(input.providerId);

    const rememberedProfile = this.settings.getProviderProfile(input.providerId);
    const nextApiKey = input.apiKey ?? rememberedProfile?.apiKey;
    const nextFallbackApiKeys = normalizeFallbackApiKeys(
      input.fallbackApiKeys ?? rememberedProfile?.fallbackApiKeys,
    );
    const nextBaseUrl = input.baseUrl ?? rememberedProfile?.baseUrl;
    const nextModel = input.providerId === 'codex'
      ? rememberedProfile?.model ?? 'codexplan'
      : input.model ?? rememberedProfile?.model;
    const nextProviderOptions = input.providerOptions ?? rememberedProfile?.providerOptions;

    if (input.providerId === 'codex') {
      await this.settings.setApiKey(undefined);
      await this.settings.setFallbackApiKeys(undefined);
      await this.settings.setBaseUrl(undefined);
      await this.settings.setModel(nextModel);
      await this.settings.setProviderOptions(rememberedProfile?.providerOptions ?? {});
    } else {
      await this.settings.setApiKey(nextApiKey);
      await this.settings.setFallbackApiKeys(nextFallbackApiKeys);
      await this.settings.setBaseUrl(nextBaseUrl);
      await this.settings.setModel(nextModel);
      await this.settings.setProviderOptions(nextProviderOptions ?? {});
    }

    await this.settings.setProviderProfile(input.providerId, {
      apiKey: input.providerId === 'codex' ? undefined : nextApiKey,
      fallbackApiKeys: input.providerId === 'codex' ? undefined : nextFallbackApiKeys,
      baseUrl: input.providerId === 'codex' ? undefined : nextBaseUrl,
      model: nextModel,
      providerOptions: nextProviderOptions ?? {},
    });
  }

  validate(input: ProviderUpdateInput): ProviderValidationResult {
    const def = PROVIDER_DEFINITIONS.find((p) => p.id === input.providerId);
    if (!def) {
      return { valid: false, errors: [`Unknown provider: ${input.providerId}`] };
    }

    const errors: string[] = [];

    if (def.requiresApiKey && !input.apiKey?.trim()) {
      errors.push(`${def.label} requires an API key`);
    }

    if (def.requiresBaseUrl && !input.baseUrl?.trim()) {
      errors.push(`${def.label} requires a base URL`);
    }

    for (const field of def.fields ?? []) {
      const value = input.providerOptions?.[field.id] ?? field.defaultValue;
      if (field.required && !value?.trim()) {
        errors.push(`${def.label} requires ${field.label}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private _buildEnvForProvider(
    def: ProviderDefinition,
    apiKey: string | undefined,
    fallbackApiKeys: string[],
    baseUrl: string | undefined,
    providerOptions: Record<string, string>,
  ): Record<string, string> {
    const env: Record<string, string> = {};

    switch (def.id) {
      case 'anthropic':
        if (apiKey) env['ANTHROPIC_API_KEY'] = apiKey;
        break;

      case 'openai':
        if (apiKey) env['OPENAI_API_KEY'] = apiKey;
        env['OPENAI_BASE_URL'] = baseUrl || def.defaultBaseUrl!;
        env['CLAUDE_CODE_USE_OPENAI'] = '1';
        break;

      case 'ollama':
        env['OPENAI_BASE_URL'] = baseUrl || def.defaultBaseUrl!;
        env['OPENAI_API_KEY'] = 'ollama';
        env['CLAUDE_CODE_USE_OPENAI'] = '1';
        break;

      case 'gemini':
        if (apiKey) env['GEMINI_API_KEY'] = apiKey;
        if (fallbackApiKeys.length > 0) env['GEMINI_FALLBACK_API_KEYS'] = JSON.stringify(fallbackApiKeys);
        if (baseUrl) env['GEMINI_BASE_URL'] = baseUrl;
        env['CLAUDE_CODE_USE_GEMINI'] = '1';
        break;

      case 'openrouter':
        if (apiKey) {
          env['OPENROUTER_API_KEY'] = apiKey;
          env['OPENAI_API_KEY'] = apiKey;
        }
        env['OPENAI_BASE_URL'] = def.defaultBaseUrl!;
        env['CLAUDE_CODE_USE_OPENAI'] = '1';
        delete env['OPENAI_AUTH_HEADER'];
        delete env['OPENAI_AUTH_SCHEME'];
        delete env['OPENAI_AUTH_HEADER_VALUE'];
        break;

      case 'codex':
        break;

      case 'freemodel':
      case 'custom-anthropic':
        if (apiKey) env['ANTHROPIC_API_KEY'] = apiKey;
        if (baseUrl) env['ANTHROPIC_BASE_URL'] = baseUrl;
        else if (def.defaultBaseUrl) env['ANTHROPIC_BASE_URL'] = def.defaultBaseUrl;
        env['CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'] = '1';
        break;

      case 'codex-freemodel':
        if (apiKey) env['OPENAI_API_KEY'] = apiKey;
        env['OPENAI_BASE_URL'] = baseUrl || def.defaultBaseUrl!;
        env['CLAUDE_CODE_USE_OPENAI'] = '1';
        break;

      case 'nvidia-nim':
        if (apiKey) {
          env['NVIDIA_API_KEY'] = apiKey;
          env['OPENAI_API_KEY'] = apiKey;
        }
        env['OPENAI_BASE_URL'] = baseUrl || def.defaultBaseUrl!;
        env['CLAUDE_CODE_USE_OPENAI'] = '1';
        env['NVIDIA_NIM'] = '1';
        break;

      case 'blackbox':
        break;

      case 'vertex': {
        const projectId = providerOptions.vertexProjectId?.trim();
        const region = normalizeVertexRegion(providerOptions.vertexRegion);
        const credentialsPath = providerOptions.vertexCredentialsPath?.trim();
        env['CLAUDE_CODE_USE_GEMINI'] = '1';
        env['GEMINI_AUTH_MODE'] = 'adc';
        if (projectId) {
          env['GOOGLE_CLOUD_PROJECT'] = projectId;
          env['GCLOUD_PROJECT'] = projectId;
          env['GOOGLE_PROJECT_ID'] = projectId;
          env['GEMINI_BASE_URL'] = buildVertexGeminiOpenAIBaseUrl(projectId, region);
        }
        if (region) env['CLOUD_ML_REGION'] = region;
        if (credentialsPath) env['GOOGLE_APPLICATION_CREDENTIALS'] = credentialsPath;
        if (baseUrl) env['GEMINI_BASE_URL'] = baseUrl;
        break;
      }

      case 'custom':
        if (apiKey) env['OPENAI_API_KEY'] = apiKey;
        if (baseUrl) env['OPENAI_BASE_URL'] = baseUrl;
        if (apiKey && isNvidiaNimBaseUrl(baseUrl)) {
          env['NVIDIA_API_KEY'] = apiKey;
          env['NVIDIA_NIM'] = '1';
        }
        env['CLAUDE_CODE_USE_OPENAI'] = '1';
        break;
    }

    return env;
  }

  private getCliProviderForProvider(providerId: string): string | undefined {
    switch (providerId) {
      case 'freemodel':
      case 'custom-anthropic':
        return 'anthropic';
      case 'nvidia-nim':
      case 'codex-freemodel':
      case 'custom':
        return 'openai';
      case 'openrouter':
        return 'openrouter';
      case 'codex':
        return 'codex';
      case 'blackbox':
        return undefined;
      case 'vertex':
        return 'gemini';
      default:
        return providerId;
    }
  }

  getCliModel(model: string | undefined): string | undefined {
    if (this.settings.selectedProvider === 'codex') {
      return model?.trim() || 'codexplan';
    }

    if (this.settings.selectedProvider !== 'vertex') {
      return model;
    }

    const trimmed = model?.trim();
    if (!trimmed) {
      return undefined;
    }

    return normalizeVertexGeminiModel(trimmed);
  }
}

function normalizeVertexRegion(region?: string): string {
  const trimmed = region?.trim();
  if (!trimmed) {
    return 'us-east5';
  }

  return trimmed.toLowerCase();
}

function buildVertexGeminiOpenAIBaseUrl(projectId: string, region: string): string {
  const host = region === 'global'
    ? 'aiplatform.googleapis.com'
    : `${region}-aiplatform.googleapis.com`;
  return `https://${host}/v1beta1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(region)}/endpoints/openapi`;
}

function normalizeVertexGeminiModel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed || trimmed.includes('/')) {
    return trimmed;
  }
  if (trimmed.toLowerCase().startsWith('gemini-')) {
    return `google/${trimmed}`;
  }
  return trimmed;
}
