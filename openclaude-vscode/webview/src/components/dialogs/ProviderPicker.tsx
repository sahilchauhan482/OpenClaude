// webview/src/components/dialogs/ProviderPicker.tsx
// Provider selection dialog — submits via postMessage only.

import React, { useState, useEffect, useCallback } from 'react';
import { vscode } from '../../vscode';

interface ProviderDef {
  id: string;
  label: string;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  supportsModel: boolean;
  defaultBaseUrl?: string;
  fields?: ProviderField[];
}

interface ProviderField {
  id: string;
  label: string;
  required: boolean;
  secret?: boolean;
  defaultValue?: string;
  placeholder?: string;
  description?: string;
}

interface ProviderPickerProps {
  providers: ProviderDef[];
  currentProviderId: string;
  currentApiKey?: string;
  currentModel?: string;
  currentBaseUrl?: string;
  currentProviderOptions?: Record<string, string>;
  providerProfiles?: Record<string, {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    providerOptions?: Record<string, string>;
  }>;
  onClose: (saved?: {
    providerId: string;
    baseUrl?: string;
    model?: string;
    providerOptions: Record<string, string>;
  }) => void;
}

export function ProviderPicker({
  providers,
  currentProviderId,
  currentApiKey,
  currentModel,
  currentBaseUrl,
  currentProviderOptions,
  providerProfiles,
  onClose,
}: ProviderPickerProps) {
  const [selectedId, setSelectedId] = useState(currentProviderId);
  const [apiKey, setApiKey] = useState(currentApiKey ?? '');
  const [baseUrl, setBaseUrl] = useState(currentBaseUrl ?? '');
  const [model, setModel] = useState(currentModel ?? '');
  const [providerOptions, setProviderOptions] = useState<Record<string, string>>(currentProviderOptions ?? {});
  const [errors, setErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const selectedDef = providers.find((p) => p.id === selectedId) ?? providers[0];

  // Reset fields when provider changes
  useEffect(() => {
    const rememberedProfile = providerProfiles?.[selectedId];
    const isCurrentProvider = selectedId === currentProviderId;
    const nextOptionsSource = isCurrentProvider
      ? { ...(rememberedProfile?.providerOptions ?? {}), ...(currentProviderOptions ?? {}) }
      : { ...(rememberedProfile?.providerOptions ?? {}) };
    const nextModel = rememberedProfile?.model ?? currentModel ?? '';

    setApiKey(
      isCurrentProvider
        ? (currentApiKey ?? rememberedProfile?.apiKey ?? '')
        : (rememberedProfile?.apiKey ?? ''),
    );
    setBaseUrl(
      isCurrentProvider
        ? (currentBaseUrl ?? rememberedProfile?.baseUrl ?? selectedDef?.defaultBaseUrl ?? '')
        : (rememberedProfile?.baseUrl ?? selectedDef?.defaultBaseUrl ?? ''),
    );
    setModel(
      isCurrentProvider
        ? (currentModel ?? rememberedProfile?.model ?? '')
        : nextModel,
    );
    setProviderOptions(Object.fromEntries(
      (selectedDef?.fields ?? []).map((field) => [
        field.id,
        nextOptionsSource[field.id] ?? field.defaultValue ?? '',
      ]),
    ));
    setErrors([]);
  }, [selectedId, selectedDef, currentProviderId, currentApiKey, currentModel, currentBaseUrl, currentProviderOptions, providerProfiles]);

  const validate = useCallback((): string[] => {
    const errs: string[] = [];
    if (selectedDef?.requiresApiKey && !apiKey.trim()) {
      errs.push(`${selectedDef.label} requires an API key`);
    }
    if (selectedDef?.requiresBaseUrl && !baseUrl.trim()) {
      errs.push(`${selectedDef.label} requires a base URL`);
    }
    for (const field of selectedDef?.fields ?? []) {
      if (field.required && !providerOptions[field.id]?.trim()) {
        errs.push(`${selectedDef.label} requires ${field.label}`);
      }
    }
    return errs;
  }, [selectedDef, apiKey, baseUrl, providerOptions]);

  const handleSubmit = useCallback(() => {
    const errs = validate();
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setIsSaving(true);
    const finalModel = model.trim() || currentModel?.trim() || undefined;
    vscode.postMessage({
      type: 'set_provider',
      providerId: selectedId,
      apiKey: apiKey.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
      model: selectedDef?.id === 'codex' ? undefined : finalModel,
      providerOptions,
    });
    onClose({
      providerId: selectedId,
      baseUrl: baseUrl.trim() || undefined,
      model: selectedDef?.id === 'codex' ? undefined : finalModel,
      providerOptions,
    });
  }, [validate, selectedId, apiKey, baseUrl, model, currentModel, selectedDef, providerOptions, onClose]);

  const updateProviderOption = useCallback((key: string, value: string) => {
    setProviderOptions((prev) => ({ ...prev, [key]: value }));
  }, []);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '4px 8px',
    fontSize: 12,
    background: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    border: '1px solid var(--vscode-input-border)',
    borderRadius: 3,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--vscode-descriptionForeground)',
    marginBottom: 3,
    display: 'block',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--vscode-editor-background)',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: 6,
          padding: 20,
          width: 360,
          maxWidth: '90vw',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600 }}>Select Provider</div>

        {/* Provider list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              style={{
                textAlign: 'left',
                padding: '6px 10px',
                borderRadius: 4,
                border: selectedId === p.id
                  ? '1px solid var(--vscode-focusBorder)'
                  : '1px solid transparent',
                background: selectedId === p.id
                  ? 'var(--vscode-list-activeSelectionBackground)'
                  : 'transparent',
                color: selectedId === p.id
                  ? 'var(--vscode-list-activeSelectionForeground)'
                  : 'var(--vscode-foreground)',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Fields */}
        {selectedDef?.requiresApiKey && (
          <div>
            <label style={labelStyle}>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter API key..."
              style={inputStyle}
            />
          </div>
        )}

        {(selectedDef?.requiresBaseUrl || selectedDef?.defaultBaseUrl) && (
          <div>
            <label style={labelStyle}>Base URL{selectedDef.requiresBaseUrl ? '' : ' (optional)'}</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={selectedDef.defaultBaseUrl ?? 'https://...'}
              style={inputStyle}
            />
          </div>
        )}

        {(selectedDef?.fields ?? []).map((field) => (
          <div key={field.id}>
            <label style={labelStyle}>
              {field.label}{field.required ? '' : ' (optional)'}
            </label>
            <input
              type={field.secret ? 'password' : 'text'}
              value={providerOptions[field.id] ?? field.defaultValue ?? ''}
              onChange={(e) => updateProviderOption(field.id, e.target.value)}
              placeholder={field.placeholder ?? ''}
              style={inputStyle}
            />
            {field.description && (
              <div style={{ fontSize: 10, color: 'var(--vscode-descriptionForeground)', marginTop: 3 }}>
                {field.description}
              </div>
            )}
          </div>
        ))}

        {selectedDef?.supportsModel && selectedDef?.id !== 'codex' && (
          <div>
            <label style={labelStyle}>Model (optional)</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={selectedDef?.id === 'blackbox' ? 'minimax-m2 or moonshotai/kimi-k2.6' : 'e.g. gpt-4o, llama3, gemini-1.5-pro'}
              style={inputStyle}
            />
          </div>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--vscode-errorForeground)' }}>
            {errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              background: 'transparent',
              border: '1px solid var(--vscode-button-border, var(--vscode-panel-border))',
              color: 'var(--vscode-foreground)',
              borderRadius: 3,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              background: 'var(--vscode-button-background)',
              color: 'var(--vscode-button-foreground)',
              border: 'none',
              borderRadius: 3,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
