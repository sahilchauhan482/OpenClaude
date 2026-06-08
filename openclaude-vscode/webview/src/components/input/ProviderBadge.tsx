// webview/src/components/input/ProviderBadge.tsx
// Shows current provider + model. Clicking opens the ProviderPicker dialog.
// This is OpenClaude-specific (Claude Code only supports Anthropic).

import { useState, useEffect } from 'react';
import { vscode } from '../../vscode';
import { ProviderPicker } from '../dialogs/ProviderPicker';

interface ProviderField {
  id: string;
  label: string;
  required: boolean;
  secret?: boolean;
  defaultValue?: string;
  placeholder?: string;
  description?: string;
}

interface ProviderDef {
  id: string;
  label: string;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  supportsModel: boolean;
  defaultBaseUrl?: string;
  fields?: ProviderField[];
}

// All providers OpenClaude supports (from openclaude/src/utils/model/providers.ts)
const BUILTIN_PROVIDERS: ProviderDef[] = [
  { id: 'anthropic', label: 'Anthropic', requiresApiKey: true, requiresBaseUrl: false, supportsModel: true },
  { id: 'openai', label: 'OpenAI', requiresApiKey: true, requiresBaseUrl: false, supportsModel: true, defaultBaseUrl: 'https://api.openai.com/v1' },
  { id: 'gemini', label: 'Google Gemini', requiresApiKey: true, requiresBaseUrl: false, supportsModel: true },
  { id: 'ollama', label: 'Ollama (Local)', requiresApiKey: false, requiresBaseUrl: false, supportsModel: true, defaultBaseUrl: 'http://localhost:11434/v1' },
  { id: 'openrouter', label: 'OpenRouter', requiresApiKey: true, requiresBaseUrl: false, supportsModel: true, defaultBaseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'codex', label: 'Codex (ChatGPT login)', requiresApiKey: false, requiresBaseUrl: false, supportsModel: true },
  { id: 'bedrock', label: 'AWS Bedrock', requiresApiKey: false, requiresBaseUrl: false, supportsModel: true },
  {
    id: 'vertex',
    label: 'Google Vertex AI',
    requiresApiKey: false,
    requiresBaseUrl: false,
    supportsModel: true,
    fields: [
      { id: 'vertexProjectId', label: 'Google Cloud Project ID', required: true, placeholder: 'my-gcp-project' },
      { id: 'vertexRegion', label: 'Region', required: false, defaultValue: 'us-east5', placeholder: 'us-east5' },
      { id: 'vertexCredentialsPath', label: 'Service Account JSON Path', required: false, placeholder: 'C:\\Users\\you\\keys\\vertex-service-account.json' },
    ],
  },
  { id: 'freemodel', label: 'Freemodel (Claude-compatible)', requiresApiKey: true, requiresBaseUrl: false, supportsModel: true, defaultBaseUrl: 'https://cc.freemodel.dev' },
  { id: 'codex-freemodel', label: 'Codex API (Freemodel)', requiresApiKey: true, requiresBaseUrl: false, supportsModel: true, defaultBaseUrl: 'https://api.freemodel.dev' },
  { id: 'blackbox', label: 'Blackbox (free via extension)', requiresApiKey: false, requiresBaseUrl: false, supportsModel: true },
  { id: 'custom-anthropic', label: 'Custom (Claude-compatible)', requiresApiKey: true, requiresBaseUrl: true, supportsModel: true },
  { id: 'github', label: 'GitHub Models', requiresApiKey: true, requiresBaseUrl: false, supportsModel: true },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', requiresApiKey: true, requiresBaseUrl: true, supportsModel: true },
];

export function ProviderBadge() {
  const [currentProviderId, setCurrentProviderId] = useState('anthropic');
  const [currentLabel, setCurrentLabel] = useState('Anthropic');
  const [currentApiKey, setCurrentApiKey] = useState<string | undefined>();
  const [currentFallbackApiKeys, setCurrentFallbackApiKeys] = useState<string[]>([]);
  const [currentModel, setCurrentModel] = useState<string | undefined>();
  const [currentBaseUrl, setCurrentBaseUrl] = useState<string | undefined>();
  const [currentProviderOptions, setCurrentProviderOptions] = useState<Record<string, string>>({});
  const [providerProfiles, setProviderProfiles] = useState<Record<string, {
    apiKey?: string;
    fallbackApiKeys?: string[];
    baseUrl?: string;
    model?: string;
    providerOptions?: Record<string, string>;
  }>>({});
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [providers, setProviders] = useState<ProviderDef[]>(BUILTIN_PROVIDERS);

  const displayModel =
    currentModel?.trim() ||
    providerProfiles[currentProviderId]?.model?.trim() ||
    '';

  // Request provider state on mount
  useEffect(() => {
    vscode.postMessage({ type: 'get_provider_state' });
  }, []);

  // Listen for open_provider_picker message (e.g. from /provider command)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'open_provider_picker') {
        setPickerOpen(true);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Listen for provider_state messages from extension host
  useEffect(() => {
    return vscode.onMessage('provider_state', (msg) => {
      const data = msg as unknown as {
        providers?: ProviderDef[];
        currentProviderId: string;
        currentApiKey?: string;
        currentFallbackApiKeys?: string[];
        currentModel?: string;
        currentBaseUrl?: string;
        currentProviderOptions?: Record<string, string>;
        providerProfiles?: Record<string, {
          apiKey?: string;
          fallbackApiKeys?: string[];
          baseUrl?: string;
          model?: string;
          providerOptions?: Record<string, string>;
        }>;
      };
      setCurrentProviderId(data.currentProviderId ?? 'anthropic');
      setCurrentApiKey(data.currentApiKey);
      setCurrentFallbackApiKeys(data.currentFallbackApiKeys ?? []);
      setCurrentModel(data.currentModel);
      setCurrentBaseUrl(data.currentBaseUrl);
      setCurrentProviderOptions(data.currentProviderOptions ?? {});
      setProviderProfiles(data.providerProfiles ?? {});
      if (data.providers && data.providers.length > 0) {
        setProviders(data.providers.map(p => ({
          ...p,
          requiresApiKey: p.requiresApiKey ?? true,
          requiresBaseUrl: p.requiresBaseUrl ?? false,
          supportsModel: p.supportsModel ?? true,
        })));
      }
      const providerDef = (data.providers ?? BUILTIN_PROVIDERS).find((p) => p.id === data.currentProviderId);
      setCurrentLabel(providerDef?.label ?? data.currentProviderId ?? 'Anthropic');
    });
  }, []);

  // Re-request state after picker closes (to refresh)
  const handlePickerClose = (saved?: {
    providerId: string;
    baseUrl?: string;
    model?: string;
    fallbackApiKeys?: string[];
    providerOptions: Record<string, string>;
  }) => {
    setPickerOpen(false);
    if (saved) {
      const providerDef = providers.find((p) => p.id === saved.providerId);
      setCurrentProviderId(saved.providerId);
      setCurrentLabel(providerDef?.label ?? saved.providerId);
      setCurrentModel(saved.model);
      setCurrentFallbackApiKeys(saved.fallbackApiKeys ?? []);
      setCurrentBaseUrl(saved.baseUrl);
      setCurrentProviderOptions(saved.providerOptions);
      setTimeout(() => vscode.postMessage({ type: 'get_provider_state' }), 250);
      return;
    }
    vscode.postMessage({ type: 'get_provider_state' });
  };

  const modelLabel = displayModel ? ` · ${displayModel}` : '';

  return (
    <>
      <button
        onClick={() => setPickerOpen(true)}
        title="Change provider"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 6px',
          fontSize: 11,
          background: 'transparent',
          border: '1px solid var(--app-input-border)',
          borderRadius: 'var(--corner-radius-small)',
          color: 'var(--app-secondary-foreground)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <ProviderIcon providerId={currentProviderId} />
        <span>{currentLabel}{modelLabel}</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" style={{ opacity: 0.6 }}>
          <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </svg>
      </button>

      {isPickerOpen && (
        <ProviderPicker
          providers={providers}
          currentProviderId={currentProviderId}
          currentApiKey={currentApiKey}
          currentFallbackApiKeys={currentFallbackApiKeys}
          currentModel={currentModel}
          currentBaseUrl={currentBaseUrl}
          currentProviderOptions={currentProviderOptions}
          providerProfiles={providerProfiles}
          onClose={handlePickerClose}
        />
      )}
    </>
  );
}

function ProviderIcon({ providerId }: { providerId: string }) {
  const icons: Record<string, string> = {
    anthropic: '◆',
    openai: '⬡',
    ollama: '🦙',
    gemini: '✦',
    codex: '⬡',
    bedrock: '☁',
    vertex: '▲',
    github: '⬢',
    blackbox: '■',
    'codex-freemodel': '⬡',
    custom: '⚙',
  };
  return <span style={{ fontSize: 10 }}>{icons[providerId] ?? '◆'}</span>;
}
