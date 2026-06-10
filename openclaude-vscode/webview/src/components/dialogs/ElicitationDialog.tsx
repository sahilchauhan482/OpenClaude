import React, { useCallback, useState } from 'react';
import type {
  ElicitationField,
  ElicitationOption,
  ElicitationRequest,
} from '../../types/interactions';
import { OptionCard } from '../shared/OptionCard';

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

