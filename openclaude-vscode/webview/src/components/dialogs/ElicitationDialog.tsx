import React, { useCallback, useState } from 'react';
import type {
  ElicitationField,
  ElicitationOption,
  ElicitationRequest,
} from '../../types/interactions';

interface ElicitationDialogProps {
  request: ElicitationRequest;
  onSubmit: (values: Record<string, unknown>) => void;
  onCancel: () => void;
}

export const ElicitationDialog: React.FC<ElicitationDialogProps> = ({
  request,
  onSubmit,
  onCancel,
}) => {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const defaults: Record<string, unknown> = {};
    for (const field of request.fields) {
      if (field.default !== undefined) {
        defaults[field.name] = field.default;
      } else if (field.type.type === 'multiselect') {
        defaults[field.name] = [];
      } else if (field.type.type === 'confirm') {
        defaults[field.name] = field.type.default ?? false;
      } else {
        defaults[field.name] = '';
      }
    }
    return defaults;
  });

  const setValue = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(values);
  }, [onSubmit, values]);

  const isValid = request.fields.every((field) => {
    if (!field.required) return true;
    const value = values[field.name];
    if (value === undefined || value === null || value === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] shadow-xl w-full max-w-2xl mx-4 overflow-hidden"
        style={{ borderRadius: 20 }}
      >
        <div
          className="px-5 py-4 border-b border-[var(--vscode-panel-border)]"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--vscode-button-background) 18%, transparent), transparent 60%)',
          }}
        >
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] opacity-60 mb-2">
            <span>AI Needs Direction</span>
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: 'var(--vscode-focusBorder)',
              }}
            />
            <span>Pick The Right Path</span>
          </div>
          <h2 className="text-sm font-semibold text-[var(--vscode-editor-foreground)]">
            {request.title || 'Question from AI'}
          </h2>
        </div>

        <div className="px-5 pt-4">
          <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-2">
            {request.message}
          </p>
          {request.helperText && (
            <p className="text-xs text-[var(--vscode-descriptionForeground)] opacity-75 mb-4">
              {request.helperText}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4">
          {request.fields.map((field) => (
            <FieldRenderer
              key={field.name}
              field={field}
              value={values[field.name]}
              onChange={(nextValue) => setValue(field.name, nextValue)}
            />
          ))}

          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--vscode-panel-border)]">
            <button
              type="button"
              className="px-3 py-1.5 text-xs rounded border border-[var(--vscode-input-border)] text-[var(--vscode-editor-foreground)] bg-transparent hover:bg-[var(--vscode-input-background)] cursor-pointer"
              onClick={onCancel}
            >
              {request.cancelLabel || 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 text-xs rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!isValid}
            >
              {request.submitLabel || 'Submit Choice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const FieldRenderer: React.FC<{
  field: ElicitationField;
  value: unknown;
  onChange: (value: unknown) => void;
}> = ({ field, value, onChange }) => {
  const fieldType = field.type;

  return (
    <div>
      <label className="block text-xs font-medium text-[var(--vscode-descriptionForeground)] mb-1">
        {field.label}
        {field.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {field.helperText && (
        <div className="text-xs text-[var(--vscode-descriptionForeground)] opacity-70 mb-2">
          {field.helperText}
        </div>
      )}

      {fieldType.type === 'text' && (
        <input
          type="text"
          className="w-full px-2 py-1.5 text-sm rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] outline-none focus:border-[var(--vscode-focusBorder)]"
          placeholder={fieldType.placeholder ?? ''}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={true}
        />
      )}

      {fieldType.type === 'select' && (
        <div className="space-y-2">
          {fieldType.options.map((option) => (
            <OptionCard
              key={option.value}
              fieldName={field.name}
              option={option}
              selected={value === option.value}
              onSelect={() => onChange(option.value)}
            />
          ))}
        </div>
      )}

      {fieldType.type === 'multiselect' && (
        <div className="space-y-2">
          {fieldType.options.map((option) => {
            const selected = Array.isArray(value) && (value as string[]).includes(option.value);
            return (
              <OptionCard
                key={option.value}
                fieldName={field.name}
                option={option}
                selected={selected}
                multi={true}
                onSelect={() => {
                  const current = Array.isArray(value) ? [...(value as string[])] : [];
                  if (selected) {
                    onChange(current.filter((item) => item !== option.value));
                  } else {
                    onChange([...current, option.value]);
                  }
                }}
              />
            );
          })}
        </div>
      )}

      {fieldType.type === 'confirm' && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 rounded border-[var(--vscode-input-border)] accent-[var(--vscode-focusBorder)]"
          />
          <span className="text-sm text-[var(--vscode-descriptionForeground)]">Yes</span>
        </label>
      )}
    </div>
  );
};

function OptionCard({
  fieldName,
  option,
  selected,
  onSelect,
  multi = false,
}: {
  fieldName: string;
  option: ElicitationOption;
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
