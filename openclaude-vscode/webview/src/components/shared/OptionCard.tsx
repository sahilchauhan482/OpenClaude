import React from 'react';

export interface OptionCardOption {
  value: string;
  label: string;
  description?: string;
  recommended?: boolean;
  recommendationNote?: string;
}

interface OptionCardProps {
  fieldName: string;
  option: OptionCardOption;
  selected: boolean;
  onSelect: () => void;
  multi?: boolean;
}

export function OptionCard({
  fieldName,
  option,
  selected,
  onSelect,
  multi = false,
}: OptionCardProps) {
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
