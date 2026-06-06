import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthManager, type ProviderUpdateInput } from '../../src/auth/authManager';
import type { ProviderProfile, SettingsSync } from '../../src/settings/settingsSync';

function makeSettings(overrides: Partial<SettingsSync> = {}): SettingsSync {
  const initialProfiles = ((overrides as { providerProfiles?: Record<string, ProviderProfile> }).providerProfiles) ?? {};
  const state = {
    selectedProvider: overrides.selectedProvider ?? 'anthropic',
    selectedModel: overrides.selectedModel,
    apiKey: overrides.apiKey,
    baseUrl: overrides.baseUrl,
    providerOptions: overrides.providerOptions ?? {},
    environmentVariables: overrides.environmentVariables ?? [],
    providerProfiles: { ...initialProfiles },
  };

  const settings = {
    get selectedProvider() {
      return state.selectedProvider;
    },
    get selectedModel() {
      return state.selectedModel;
    },
    get apiKey() {
      return state.apiKey;
    },
    get baseUrl() {
      return state.baseUrl;
    },
    get providerOptions() {
      return state.providerOptions;
    },
    get environmentVariables() {
      return state.environmentVariables;
    },
    get providerProfiles() {
      return state.providerProfiles;
    },
    setProvider: vi.fn(async (providerId: string) => {
      state.selectedProvider = providerId;
    }),
    setModel: vi.fn(async (model: string | undefined) => {
      state.selectedModel = model;
    }),
    setApiKey: vi.fn(async (apiKey: string | undefined) => {
      state.apiKey = apiKey;
    }),
    setBaseUrl: vi.fn(async (baseUrl: string | undefined) => {
      state.baseUrl = baseUrl;
    }),
    setProviderOptions: vi.fn(async (providerOptions: Record<string, string> | undefined) => {
      state.providerOptions = providerOptions ?? {};
    }),
    getProviderProfile: vi.fn((providerId: string) => state.providerProfiles[providerId]),
    setProviderProfile: vi.fn(async (providerId: string, profile: ProviderProfile | undefined) => {
      if (profile) {
        state.providerProfiles = {
          ...state.providerProfiles,
          [providerId]: {
            apiKey: profile.apiKey,
            baseUrl: profile.baseUrl,
            model: profile.model,
            providerOptions: profile.providerOptions ?? {},
          },
        };
        return;
      }
      const nextProfiles = { ...state.providerProfiles };
      delete nextProfiles[providerId];
      state.providerProfiles = nextProfiles;
    }),
  };

  return settings as unknown as SettingsSync;
}

describe('AuthManager', () => {
  describe('getAvailableProviders', () => {
    it('returns all supported providers', () => {
      const manager = new AuthManager(makeSettings());
      const providers = manager.getAvailableProviders();
      const ids = providers.map((p) => p.id);
      expect(ids).toContain('anthropic');
      expect(ids).toContain('openai');
      expect(ids).toContain('ollama');
      expect(ids).toContain('gemini');
      expect(ids).toContain('vertex');
      expect(ids).toContain('codex');
      expect(ids).toContain('freemodel');
      expect(ids).toContain('blackbox');
      expect(ids).toContain('custom-anthropic');
      expect(ids).toContain('custom');
    });
  });

  describe('buildProcessEnv — anthropic', () => {
    it('sets ANTHROPIC_API_KEY', () => {
      const manager = new AuthManager(makeSettings({ selectedProvider: 'anthropic', apiKey: 'sk-ant-test' }));
      const env = manager.buildProcessEnv();
      expect(env['ANTHROPIC_API_KEY']).toBe('sk-ant-test');
      expect(env['CLAUDE_CODE_USE_OPENAI']).toBeUndefined();
    });
  });

  describe('buildProcessEnv — openai', () => {
    it('sets OPENAI_API_KEY and CLAUDE_CODE_USE_OPENAI', () => {
      const manager = new AuthManager(makeSettings({ selectedProvider: 'openai', apiKey: 'sk-openai-test' }));
      const env = manager.buildProcessEnv();
      expect(env['OPENAI_API_KEY']).toBe('sk-openai-test');
      expect(env['CLAUDE_CODE_USE_OPENAI']).toBe('1');
    });

    it('sets OPENAI_BASE_URL when provided', () => {
      const manager = new AuthManager(makeSettings({
        selectedProvider: 'openai',
        apiKey: 'sk-openai-test',
        baseUrl: 'https://api.openai.com/v1',
      }));
      const env = manager.buildProcessEnv();
      expect(env['OPENAI_BASE_URL']).toBe('https://api.openai.com/v1');
    });
  });

  describe('buildProcessEnv — ollama', () => {
    it('uses default localhost base URL and ollama api key', () => {
      const manager = new AuthManager(makeSettings({ selectedProvider: 'ollama' }));
      const env = manager.buildProcessEnv();
      expect(env['OPENAI_BASE_URL']).toBe('http://localhost:11434/v1');
      expect(env['OPENAI_API_KEY']).toBe('ollama');
      expect(env['CLAUDE_CODE_USE_OPENAI']).toBe('1');
    });

    it('allows custom base URL override', () => {
      const manager = new AuthManager(makeSettings({ selectedProvider: 'ollama', baseUrl: 'http://myhost:11434/v1' }));
      const env = manager.buildProcessEnv();
      expect(env['OPENAI_BASE_URL']).toBe('http://myhost:11434/v1');
    });
  });

  describe('buildProcessEnv — gemini', () => {
    it('sets Gemini env vars and CLAUDE_CODE_USE_GEMINI', () => {
      const manager = new AuthManager(makeSettings({
        selectedProvider: 'gemini',
        apiKey: 'gemini-key',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      }));
      const env = manager.buildProcessEnv();
      expect(env['GEMINI_API_KEY']).toBe('gemini-key');
      expect(env['GEMINI_BASE_URL']).toBe('https://generativelanguage.googleapis.com/v1beta');
      expect(env['CLAUDE_CODE_USE_GEMINI']).toBe('1');
      expect(env['CLAUDE_CODE_USE_OPENAI']).toBeUndefined();
    });
  });

  describe('buildProcessEnv — custom', () => {
    it('sets OPENAI_API_KEY, OPENAI_BASE_URL, and CLAUDE_CODE_USE_OPENAI', () => {
      const manager = new AuthManager(makeSettings({
        selectedProvider: 'custom',
        apiKey: 'custom-key',
        baseUrl: 'https://my-llm.example.com/v1',
      }));
      const env = manager.buildProcessEnv();
      expect(env['OPENAI_API_KEY']).toBe('custom-key');
      expect(env['OPENAI_BASE_URL']).toBe('https://my-llm.example.com/v1');
      expect(env['CLAUDE_CODE_USE_OPENAI']).toBe('1');
    });
  });

  describe('buildProcessEnv — merges user env vars', () => {
    it('includes user-configured environment variables', () => {
      const manager = new AuthManager(makeSettings({
        selectedProvider: 'anthropic',
        apiKey: 'sk-ant-test',
        environmentVariables: [{ name: 'MY_VAR', value: 'hello' }],
      }));
      const env = manager.buildProcessEnv();
      expect(env['MY_VAR']).toBe('hello');
      expect(env['ANTHROPIC_API_KEY']).toBe('sk-ant-test');
    });
  });

  it('pins the CLI child process to the OpenClaude config home', () => {
    const manager = new AuthManager(makeSettings({
      selectedProvider: 'anthropic',
      apiKey: 'sk-ant-test',
    }));
    const env = manager.buildProcessEnv();
    expect(env['CLAUDE_CONFIG_DIR']).toBe(path.join(os.homedir(), '.openclaude'));
  });

  describe('buildProcessEnv freemodel', () => {
    it('sets Anthropic-compatible env vars with the default Freemodel endpoint', () => {
      const manager = new AuthManager(makeSettings({
        selectedProvider: 'freemodel',
        apiKey: 'fm-key',
      }));
      const env = manager.buildProcessEnv();
      expect(env['ANTHROPIC_API_KEY']).toBe('fm-key');
      expect(env['ANTHROPIC_BASE_URL']).toBe('https://cc.freemodel.dev');
      expect(env['CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC']).toBe('1');
      expect(env['CLAUDE_CODE_USE_OPENAI']).toBeUndefined();
      expect(env['OPENAI_BASE_URL']).toBeUndefined();
      expect(env['OPENAI_API_KEY']).toBeUndefined();
    });

    it('sets OpenAI-compatible env vars for Codex API Freemodel instead of Codex login env', () => {
      const manager = new AuthManager(makeSettings({
        selectedProvider: 'codex-freemodel',
        apiKey: 'fm-codex-key',
      }));
      const env = manager.buildProcessEnv();
      expect(env['OPENAI_API_KEY']).toBe('fm-codex-key');
      expect(env['OPENAI_BASE_URL']).toBe('https://api.freemodel.dev');
      expect(env['CLAUDE_CODE_USE_OPENAI']).toBe('1');
      expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
      expect(env['ANTHROPIC_BASE_URL']).toBeUndefined();
    });

    it('provider env overrides Codex login variables from custom environment settings', () => {
      const manager = new AuthManager(makeSettings({
        selectedProvider: 'codex-freemodel',
        apiKey: 'fm-codex-key',
        environmentVariables: [
          { name: 'OPENAI_BASE_URL', value: 'https://chatgpt.com/backend-api/codex' },
          { name: 'OPENAI_API_KEY', value: 'codex-login-key' },
        ],
      }));
      const env = manager.buildProcessEnv();
      expect(env['OPENAI_API_KEY']).toBe('fm-codex-key');
      expect(env['OPENAI_BASE_URL']).toBe('https://api.freemodel.dev');
    });
  });

  describe('buildProcessEnv custom-anthropic', () => {
    it('sets Anthropic-compatible env vars for a custom Claude gateway', () => {
      const manager = new AuthManager(makeSettings({
        selectedProvider: 'custom-anthropic',
        apiKey: 'custom-claude-key',
        baseUrl: 'https://cc.example.com',
      }));
      const env = manager.buildProcessEnv();
      expect(env['ANTHROPIC_API_KEY']).toBe('custom-claude-key');
      expect(env['ANTHROPIC_BASE_URL']).toBe('https://cc.example.com');
      expect(env['CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC']).toBe('1');
      expect(env['CLAUDE_CODE_USE_OPENAI']).toBeUndefined();
    });
  });

  describe('buildProcessEnv vertex', () => {
    it('sets Vertex Gemini mode and Google auth environment variables', () => {
      const manager = new AuthManager(makeSettings({
        selectedProvider: 'vertex',
        providerOptions: {
          vertexProjectId: 'my-gcp-project',
          vertexRegion: 'us-central1',
          vertexCredentialsPath: 'C:\\keys\\vertex.json',
        },
      }));
      const env = manager.buildProcessEnv();
      expect(env['CLAUDE_CODE_USE_VERTEX']).toBeUndefined();
      expect(env['CLAUDE_CODE_USE_GEMINI']).toBe('1');
      expect(env['GEMINI_AUTH_MODE']).toBe('adc');
      expect(env['GOOGLE_CLOUD_PROJECT']).toBe('my-gcp-project');
      expect(env['GCLOUD_PROJECT']).toBe('my-gcp-project');
      expect(env['GOOGLE_PROJECT_ID']).toBe('my-gcp-project');
      expect(env['CLOUD_ML_REGION']).toBe('us-central1');
      expect(env['GOOGLE_APPLICATION_CREDENTIALS']).toBe('C:\\keys\\vertex.json');
      expect(env['GEMINI_BASE_URL']).toBe('https://us-central1-aiplatform.googleapis.com/v1beta1/projects/my-gcp-project/locations/us-central1/endpoints/openapi');
      expect(env['ANTHROPIC_VERTEX_BASE_URL']).toBeUndefined();
    });

    it('allows overriding the Vertex Gemini base URL explicitly', () => {
      const manager = new AuthManager(makeSettings({
        selectedProvider: 'vertex',
        baseUrl: 'https://vertex.example.com',
        providerOptions: {
          vertexProjectId: 'my-gcp-project',
          vertexRegion: 'us-central1',
        },
      }));
      const env = manager.buildProcessEnv();
      expect(env['GEMINI_BASE_URL']).toBe('https://vertex.example.com');
    });

    it('normalizes the Vertex region to lowercase', () => {
      const manager = new AuthManager(makeSettings({
        selectedProvider: 'vertex',
        providerOptions: {
          vertexProjectId: 'my-gcp-project',
          vertexRegion: 'Global',
        },
      }));
      const env = manager.buildProcessEnv();
      expect(env['CLOUD_ML_REGION']).toBe('global');
      expect(env['GEMINI_BASE_URL']).toBe('https://aiplatform.googleapis.com/v1beta1/projects/my-gcp-project/locations/global/endpoints/openapi');
    });
  });

  describe('buildProcessEnv blackbox', () => {
    it('does not require API credentials because it uses the Blackbox extension bridge', () => {
      const manager = new AuthManager(makeSettings({ selectedProvider: 'blackbox' }));
      const env = manager.buildProcessEnv();
      expect(env['OPENAI_API_KEY']).toBeUndefined();
      expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
      expect(env['CLAUDE_CODE_USE_OPENAI']).toBeUndefined();
    });
  });

  describe('buildProcessEnv codex', () => {
    it('does not inject API credentials and relies on the logged-in ChatGPT account', () => {
      const manager = new AuthManager(makeSettings({ selectedProvider: 'codex' }));
      const env = manager.buildProcessEnv();
      expect(env['OPENAI_API_KEY']).toBeUndefined();
      expect(env['OPENAI_BASE_URL']).toBeUndefined();
      expect(env['CLAUDE_CODE_USE_OPENAI']).toBeUndefined();
    });
  });

  describe('validate', () => {
    it('passes for anthropic with api key', () => {
      const manager = new AuthManager(makeSettings());
      const result = manager.validate({ providerId: 'anthropic', apiKey: 'sk-ant-test' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails for anthropic without api key', () => {
      const manager = new AuthManager(makeSettings());
      const result = manager.validate({ providerId: 'anthropic', apiKey: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('passes for ollama without api key (not required)', () => {
      const manager = new AuthManager(makeSettings());
      const result = manager.validate({ providerId: 'ollama' });
      expect(result.valid).toBe(true);
    });

    it('fails for custom without base URL', () => {
      const manager = new AuthManager(makeSettings());
      const result = manager.validate({ providerId: 'custom', apiKey: 'key', baseUrl: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /base url/i.test(e))).toBe(true);
    });

    it('fails for vertex without a Google Cloud project ID', () => {
      const manager = new AuthManager(makeSettings());
      const result = manager.validate({ providerId: 'vertex', providerOptions: { vertexProjectId: '' } });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /project id/i.test(e))).toBe(true);
    });

    it('fails for unknown provider', () => {
      const manager = new AuthManager(makeSettings());
      const result = manager.validate({ providerId: 'unknown-provider' });
      expect(result.valid).toBe(false);
    });
  });

  describe('getCliProvider', () => {
    it('forces custom Claude-compatible gateways through Anthropic provider mode', () => {
      expect(new AuthManager(makeSettings({ selectedProvider: 'freemodel' })).getCliProvider()).toBe('anthropic');
      expect(new AuthManager(makeSettings({ selectedProvider: 'custom-anthropic' })).getCliProvider()).toBe('anthropic');
    });

    it('passes through explicit non-Codex providers', () => {
      expect(new AuthManager(makeSettings({ selectedProvider: 'gemini' })).getCliProvider()).toBe('gemini');
      expect(new AuthManager(makeSettings({ selectedProvider: 'vertex' })).getCliProvider()).toBe('gemini');
      expect(new AuthManager(makeSettings({ selectedProvider: 'custom' })).getCliProvider()).toBe('openai');
    });

    it('passes Codex explicitly so ChatGPT login is only used when selected', () => {
      expect(new AuthManager(makeSettings({ selectedProvider: 'codex' })).getCliProvider()).toBe('codex');
    });

    it('leaves Blackbox unset because it is handled inside the VS Code extension', () => {
      expect(new AuthManager(makeSettings({ selectedProvider: 'blackbox' })).getCliProvider()).toBeUndefined();
    });

    it('normalizes Vertex Gemini model names for the CLI', () => {
      const manager = new AuthManager(makeSettings({ selectedProvider: 'vertex' }));
      expect(manager.getCliModel('gemini-3-pro-preview')).toBe('google/gemini-3-pro-preview');
      expect(manager.getCliModel('google/gemini-3-pro-preview')).toBe('google/gemini-3-pro-preview');
    });

    it('uses codexplan as the explicit ChatGPT-login model when Codex has no saved model', () => {
      const manager = new AuthManager(makeSettings({ selectedProvider: 'codex' }));
      expect(manager.getCliModel(undefined)).toBe('codexplan');
    });
  });

  describe('updateProvider', () => {
    it('calls settings setters with provided values', async () => {
      const settings = makeSettings();
      const manager = new AuthManager(settings);
      await manager.updateProvider({
        providerId: 'openai',
        apiKey: 'sk-new',
        model: 'gpt-4o',
        providerOptions: { vertexProjectId: 'project' },
      });
      expect(settings.setProvider).toHaveBeenCalledWith('openai');
      expect(settings.setApiKey).toHaveBeenCalledWith('sk-new');
      expect(settings.setModel).toHaveBeenCalledWith('gpt-4o');
      expect(settings.setProviderOptions).toHaveBeenCalledWith({ vertexProjectId: 'project' });
    });

    it('remembers provider-specific config and restores it when switching back', async () => {
      const settings = makeSettings({
        selectedProvider: 'anthropic',
        apiKey: 'anthropic-key',
        baseUrl: 'https://anthropic.example.com',
        selectedModel: 'claude-3.5-sonnet',
        providerOptions: { profile: 'anthropic' },
      });
      const manager = new AuthManager(settings);

      await manager.updateProvider({
        providerId: 'openai',
        apiKey: 'openai-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        providerOptions: { profile: 'openai' },
      });

      expect(settings.getProviderProfile('anthropic')).toEqual({
        apiKey: 'anthropic-key',
        baseUrl: 'https://anthropic.example.com',
        model: 'claude-3.5-sonnet',
        providerOptions: { profile: 'anthropic' },
      });
      expect(settings.selectedProvider).toBe('openai');
      expect(settings.apiKey).toBe('openai-key');
      expect(settings.baseUrl).toBe('https://api.openai.com/v1');
      expect(settings.selectedModel).toBe('gpt-4o');
      expect(settings.providerOptions).toEqual({ profile: 'openai' });

      await manager.updateProvider({ providerId: 'anthropic' });

      expect(settings.selectedProvider).toBe('anthropic');
      expect(settings.apiKey).toBe('anthropic-key');
      expect(settings.baseUrl).toBe('https://anthropic.example.com');
      expect(settings.selectedModel).toBe('claude-3.5-sonnet');
      expect(settings.providerOptions).toEqual({ profile: 'anthropic' });
    });

    it('restores remembered provider values when input omits them', async () => {
      const settings = makeSettings({
        selectedProvider: 'gemini',
        providerProfiles: {
          gemini: {
            apiKey: 'gemini-key',
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
            model: 'gemma-4-31b-it',
            providerOptions: { vertexProjectId: 'demo-project' },
          },
        },
      });
      const manager = new AuthManager(settings);

      const current = manager.getCurrentProvider();

      expect(current.env['GEMINI_API_KEY']).toBe('gemini-key');
      expect(current.env['GEMINI_BASE_URL']).toBe('https://generativelanguage.googleapis.com/v1beta');
      expect(current.model).toBe('gemma-4-31b-it');
      expect(current.providerOptions).toEqual({ vertexProjectId: 'demo-project' });
    });

    it('clears api key/base URL and pins codexplan when switching to Codex login', async () => {
      const settings = makeSettings({
        apiKey: 'old-key',
        baseUrl: 'https://old.example.com',
        selectedModel: 'minimax-m2',
      });
      const manager = new AuthManager(settings);
      await manager.updateProvider({
        providerId: 'codex',
        model: 'minimax-m2',
      });
      expect(settings.setProvider).toHaveBeenCalledWith('codex');
      expect(settings.setApiKey).toHaveBeenCalledWith(undefined);
      expect(settings.setBaseUrl).toHaveBeenCalledWith(undefined);
      expect(settings.setModel).toHaveBeenCalledWith('codexplan');
    });
  });
});
