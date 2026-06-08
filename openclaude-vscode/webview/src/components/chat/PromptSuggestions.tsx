import React from 'react';

interface PromptSuggestionsProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  isVisible: boolean;
  variant?: 'chips' | 'choices';
  title?: string;
}

export const PromptSuggestions: React.FC<PromptSuggestionsProps> = ({
  suggestions,
  onSelect,
  isVisible,
  variant = 'chips',
  title,
}) => {
  if (!isVisible || suggestions.length === 0) return null;

  if (variant === 'choices') {
    return (
      <div
        style={{
          padding: '10px 16px 0',
        }}
      >
        <div
          style={{
            border: '1px solid var(--app-input-border)',
            borderRadius: '14px',
            background: 'color-mix(in srgb, var(--app-panel-background, var(--vscode-editorWidget-background)) 88%, transparent)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '10px 12px 8px',
              borderBottom: '1px solid var(--app-input-border)',
              fontSize: 11,
              letterSpacing: 0.2,
              textTransform: 'uppercase',
              color: 'var(--app-secondary-foreground)',
            }}
          >
            {title || 'Choose a reply'}
          </div>
          <div style={{ padding: 10, display: 'grid', gap: 8 }}>
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion}-${index}`}
                onClick={() => onSelect(suggestion)}
                title={suggestion}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid var(--app-input-border)',
                  background: 'transparent',
                  color: 'var(--app-primary-foreground)',
                  cursor: 'pointer',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 16,
                    height: 16,
                    minWidth: 16,
                    borderRadius: 999,
                    border: '1.5px solid var(--vscode-focusBorder)',
                    marginTop: 1,
                    boxSizing: 'border-box',
                  }}
                />
                <span style={{ flex: 1, fontSize: 12, lineHeight: 1.45 }}>
                  {suggestion}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <div className="text-xs text-vscode-fg/40 mb-1.5">{title || 'Suggested prompts:'}</div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((suggestion, i) => (
          <button
            key={i}
            className="px-2.5 py-1 text-xs rounded-full border border-vscode-border text-vscode-fg/70 bg-transparent hover:bg-vscode-input-bg hover:text-vscode-fg hover:border-vscode-fg/40 cursor-pointer transition-colors"
            onClick={() => onSelect(suggestion)}
            title={suggestion}
          >
            {suggestion.length > 60 ? suggestion.slice(0, 57) + '...' : suggestion}
          </button>
        ))}
      </div>
    </div>
  );
};
