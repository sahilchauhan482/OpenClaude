import { useState, useRef, useEffect } from 'react';
import { vscode } from '../../vscode';

const EFFORTS = [
  { value: 'low', label: 'Low', bar: 'L', hint: 'Fastest. Best for quick edits and simple checks.' },
  { value: 'medium', label: 'Medium', bar: 'M', hint: 'Balanced default for normal coding work.' },
  { value: 'high', label: 'High', bar: 'H', hint: 'Deeper reasoning. Slower, but better for harder tasks.' },
  { value: 'max', label: 'Max', bar: 'X', hint: 'Maximum reasoning. Use only for the toughest tasks.' },
] as const;

interface EffortSelectorProps {
  currentEffort?: string | null;
  disabled?: boolean;
  onEffortChange?: (level: string) => void;
}

export function EffortSelector({ currentEffort, disabled, onEffortChange }: EffortSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const current = EFFORTS.find((effort) => effort.value === currentEffort) ?? EFFORTS[1];

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        title={`Effort: ${current.label} - ${current.hint}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          borderRadius: 'var(--corner-radius-small)',
          border: 'none',
          background: 'transparent',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: 'var(--app-secondary-foreground)',
          opacity: disabled ? 0.4 : 1,
          padding: 0,
          fontSize: 11,
          fontFamily: 'monospace',
          fontWeight: 700,
        }}
      >
        {current.bar}
      </button>
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: 4,
            width: 220,
            background: 'var(--app-menu-background)',
            border: '1px solid var(--app-input-border)',
            borderRadius: 'var(--corner-radius-medium)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 50,
          }}
        >
          <div
            style={{
              padding: '6px 12px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--app-secondary-foreground)',
              borderBottom: '1px solid var(--app-input-border)',
            }}
          >
            Effort Level
          </div>
          {EFFORTS.map((effort) => (
            <button
              key={effort.value}
              onClick={() => {
                if (onEffortChange) {
                  onEffortChange(effort.value);
                } else {
                  vscode.postMessage({ type: 'set_effort_level', level: effort.value });
                }
                setIsOpen(false);
              }}
              style={{
                display: 'grid',
                gridTemplateColumns: '18px 1fr',
                gap: 8,
                width: '100%',
                padding: '8px 12px',
                fontSize: 12,
                textAlign: 'left',
                background: effort.value === currentEffort ? 'var(--app-list-active-background)' : 'transparent',
                color: effort.value === currentEffort ? 'var(--app-list-active-foreground)' : 'var(--app-primary-foreground)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontFamily: 'monospace', fontWeight: 700, lineHeight: '16px' }}>{effort.bar}</span>
              <span>
                <span style={{ display: 'block', fontWeight: 600 }}>{effort.label}</span>
                <span style={{ display: 'block', fontSize: 11, opacity: 0.8, lineHeight: 1.4 }}>{effort.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
