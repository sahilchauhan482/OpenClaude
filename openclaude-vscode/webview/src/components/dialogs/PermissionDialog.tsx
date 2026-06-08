// webview/src/components/dialogs/PermissionDialog.tsx
// Modal dialog showing a permission request with tool info and action buttons.

import { useEffect, useCallback, useMemo, useState } from 'react';
import type { PermissionRequest } from '../../hooks/usePermissions';

interface PermissionDialogProps {
  request: PermissionRequest;
  pendingCount: number;
  onAllow: (requestId: string, updatedInput?: Record<string, unknown>) => void;
  onAlwaysAllow: (requestId: string) => void;
  onDeny: (requestId: string) => void;
}

function getRiskColor(riskLevel?: string): { bg: string; border: string; text: string; badge: string } {
  switch (riskLevel) {
    case 'high':
      return {
        bg: 'bg-red-500/10',
        border: 'border-red-500/40',
        text: 'text-red-400',
        badge: 'bg-red-500/20 text-red-300',
      };
    case 'medium':
      return {
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/40',
        text: 'text-yellow-400',
        badge: 'bg-yellow-500/20 text-yellow-300',
      };
    default:
      return {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/40',
        text: 'text-blue-400',
        badge: 'bg-blue-500/20 text-blue-300',
      };
  }
}

function formatToolInput(toolName: string, input: Record<string, unknown>): string {
  if (toolName.toLowerCase().includes('bash') || toolName.toLowerCase().includes('execute')) {
    const cmd = input.command ?? input.cmd ?? input.script;
    if (typeof cmd === 'string') return cmd;
  }

  if (toolName.toLowerCase().includes('read') || toolName.toLowerCase().includes('search')) {
    const path = input.path ?? input.file ?? input.pattern;
    if (typeof path === 'string') return path;
  }

  if (toolName.toLowerCase().includes('write') || toolName.toLowerCase().includes('edit')) {
    const path = input.path ?? input.file_path ?? input.filename;
    if (typeof path === 'string') {
      const content = input.content ?? input.new_string ?? input.text;
      if (typeof content === 'string') {
        const preview = content.length > 200 ? `${content.substring(0, 200)}...` : content;
        return `${path}\n\n${preview}`;
      }
      return String(path);
    }
  }

  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function buildInitialValues(request: PermissionRequest): Record<string, unknown> {
  const interaction = request.interaction;
  if (!interaction) {
    return {};
  }

  const nextValues: Record<string, unknown> = {};
  for (const field of interaction.fields) {
    if (field.default !== undefined) {
      nextValues[field.name] = field.default;
    } else {
      nextValues[field.name] = field.type.type === 'multiselect' ? [] : '';
    }
  }
  return nextValues;
}

export function PermissionDialog({
  request,
  pendingCount,
  onAllow,
  onAlwaysAllow,
  onDeny,
}: PermissionDialogProps) {
  const colors = getRiskColor(request.riskLevel);
  const [values, setValues] = useState<Record<string, unknown>>(() => buildInitialValues(request));

  useEffect(() => {
    setValues(buildInitialValues(request));
  }, [request]);

  const displayName = request.interaction?.title || request.title || request.toolName;
  const formattedInput = formatToolInput(request.toolName, request.toolInput);
  const isStructuredQuestion = request.interaction?.kind === 'structured_questions';

  const isValid = useMemo(() => {
    if (!request.interaction) {
      return true;
    }

    return request.interaction.fields.every((field) => {
      if (!field.required) {
        return true;
      }
      const value = values[field.name];
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
    });
  }, [request.interaction, values]);

  const submitStructuredResponse = useCallback(() => {
    if (!request.interaction) {
      onAllow(request.requestId);
      return;
    }

    const answers: Record<string, string> = {};
    for (const field of request.interaction.fields) {
      const value = values[field.name];
      if (Array.isArray(value)) {
        answers[field.name] = value.map((entry) => String(entry)).join(', ');
      } else if (value !== undefined && value !== null) {
        answers[field.name] = String(value);
      }
    }

    onAllow(request.requestId, {
      ...request.toolInput,
      answers,
    });
  }, [onAllow, request, values]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (isStructuredQuestion) {
          if (isValid) {
            submitStructuredResponse();
          }
          return;
        }
        onAllow(request.requestId);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onDeny(request.requestId);
      }
    },
    [isStructuredQuestion, isValid, onAllow, onDeny, request.requestId, submitStructuredResponse],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className={`w-full max-w-lg mx-4 rounded-lg border ${colors.border} bg-[var(--vscode-editor-background)] shadow-xl`}
      >
        <div className={`px-4 py-3 rounded-t-lg ${colors.bg} border-b ${colors.border}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${colors.text}`}>
                {isStructuredQuestion ? 'Question' : 'Permission Request'}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${colors.badge}`}>
                {request.riskLevel ?? 'low'}
              </span>
            </div>
            {pendingCount > 1 && (
              <span className="text-xs text-[var(--vscode-descriptionForeground)]">
                +{pendingCount - 1} more
              </span>
            )}
          </div>
          <div className="mt-1 text-sm font-semibold text-[var(--vscode-editor-foreground)]">
            {displayName}
          </div>
          {request.description && (
            <div className="mt-0.5 text-xs text-[var(--vscode-descriptionForeground)]">
              {request.description}
            </div>
          )}
        </div>

        <div className="px-4 py-3 max-h-[28rem] overflow-y-auto">
          {request.decisionReason && (
            <div className="mb-2 text-xs text-[var(--vscode-descriptionForeground)] italic">
              {request.decisionReason}
            </div>
          )}

          {request.blockedPath && (
            <div className="mb-2 px-2 py-1.5 rounded text-xs bg-red-500/10 border border-red-500/30 text-red-400">
              Blocked path: {request.blockedPath}
            </div>
          )}

          {request.interaction ? (
            <div className="space-y-4">
              {request.interaction.helperText && (
                <div className="text-xs text-[var(--vscode-descriptionForeground)]">
                  {request.interaction.helperText}
                </div>
              )}
              {request.interaction.fields.map((field) => (
                <div key={field.name}>
                  <div className="mb-1 text-xs font-medium text-[var(--vscode-editor-foreground)]">
                    {field.label}
                    {field.required ? ' *' : ''}
                  </div>
                  {field.helperText && (
                    <div className="mb-2 text-xs text-[var(--vscode-descriptionForeground)]">
                      {field.helperText}
                    </div>
                  )}

                  {field.type.type === 'select' && (
                    <div className="space-y-2">
                      {field.type.options.map((option) => (
                        <OptionCard
                          key={`${field.name}-${option.value}`}
                          fieldName={field.name}
                          option={option}
                          selected={values[field.name] === option.value}
                          onSelect={() => setValues((prev) => ({ ...prev, [field.name]: option.value }))}
                        />
                      ))}
                    </div>
                  )}

                  {field.type.type === 'multiselect' && (
                    <div className="space-y-2">
                      {field.type.options.map((option) => {
                        const current = Array.isArray(values[field.name]) ? values[field.name] as string[] : [];
                        const selected = current.includes(option.value);
                        return (
                          <OptionCard
                            key={`${field.name}-${option.value}`}
                            fieldName={field.name}
                            option={option}
                            selected={selected}
                            multi={true}
                            onSelect={() => {
                              const next = selected
                                ? current.filter((entry) => entry !== option.value)
                                : [...current, option.value];
                              setValues((prev) => ({ ...prev, [field.name]: next }));
                            }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <pre className="text-xs font-mono whitespace-pre-wrap break-all text-[var(--vscode-editor-foreground)] bg-[var(--vscode-input-background)] rounded p-2 border border-[var(--vscode-input-border)]">
              {formattedInput}
            </pre>
          )}

          {request.agentId && (
            <div className="mt-2 text-xs text-[var(--vscode-descriptionForeground)]">
              Agent: {request.agentId}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[var(--vscode-panel-border)] flex items-center justify-between">
          <span className="text-xs text-[var(--vscode-descriptionForeground)]">
            {request.interaction ? 'Enter=Submit · Esc=Cancel' : 'Enter=Allow · Esc=Deny'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onDeny(request.requestId)}
              className="px-3 py-1.5 text-xs rounded border border-[var(--vscode-input-border)] text-[var(--vscode-editor-foreground)] hover:bg-[var(--vscode-input-background)] transition-colors"
            >
              {request.interaction?.cancelLabel || 'Deny'}
            </button>
            {!request.interaction && (
              <button
                onClick={() => onAlwaysAllow(request.requestId)}
                className="px-3 py-1.5 text-xs rounded border border-[var(--vscode-input-border)] text-[var(--vscode-editor-foreground)] hover:bg-[var(--vscode-input-background)] transition-colors"
              >
                Always Allow
              </button>
            )}
            <button
              onClick={() => {
                if (request.interaction) {
                  submitStructuredResponse();
                  return;
                }
                onAllow(request.requestId);
              }}
              className="px-3 py-1.5 text-xs rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={request.interaction ? !isValid : false}
            >
              {request.interaction?.submitLabel || 'Allow'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OptionCard({
  fieldName,
  option,
  selected,
  onSelect,
  multi = false,
}: {
  fieldName: string;
  option: {
    value: string;
    label: string;
    description?: string;
    recommended?: boolean;
    recommendationNote?: string;
  };
  selected: boolean;
  onSelect: () => void;
  multi?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-3 px-3 py-3 rounded-xl border cursor-pointer text-sm transition-colors ${
        selected
          ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-editor-foreground)]'
          : 'border-[var(--vscode-input-border)] bg-transparent text-[var(--vscode-descriptionForeground)] hover:border-[var(--vscode-editor-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
      }`}
    >
      <input
        type={multi ? 'checkbox' : 'radio'}
        name={fieldName}
        value={option.value}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
      <div
        className={`flex-shrink-0 flex items-center justify-center ${
          multi ? 'w-4 h-4 rounded' : 'w-3.5 h-3.5 rounded-full'
        } border-2 ${selected ? 'border-[var(--vscode-focusBorder)]' : 'border-[var(--vscode-input-border)]'}`}
        style={{
          marginTop: 2,
          background: multi && selected ? 'var(--vscode-focusBorder)' : 'transparent',
        }}
      >
        {selected && (
          multi ? (
            <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
              <path d="M10 3L4.5 8.5 2 6" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--vscode-focusBorder)]" />
          )
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-medium">{option.label}</div>
          {option.recommended && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.25,
                textTransform: 'uppercase',
                color: 'var(--vscode-button-foreground)',
                background: 'var(--vscode-button-background)',
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              Recommended
            </span>
          )}
        </div>
        {option.description && (
          <div className="text-xs text-[var(--vscode-descriptionForeground)] mt-0.5">
            {option.description}
          </div>
        )}
        {option.recommendationNote && (
          <div
            className="text-xs mt-1"
            style={{
              color: 'var(--vscode-focusBorder)',
              opacity: 0.9,
            }}
          >
            {option.recommendationNote}
          </div>
        )}
      </div>
    </label>
  );
}
