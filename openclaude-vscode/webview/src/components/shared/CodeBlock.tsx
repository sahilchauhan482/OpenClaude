import { useState, useCallback } from 'react';

interface CodeBlockProps {
  children: string;
  language?: string;
  className?: string;
}

export function CodeBlock({ children, language, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const lang = language || extractLanguage(className);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [children]);

  return (
    <div className="code-block-wrapper group">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 12px', fontSize: 'var(--text-sm)',
        background: 'var(--vscode-editorGroupHeader-tabsBackground)',
        borderBottom: '1px solid color-mix(in srgb, var(--app-input-border) 50%, transparent)',
        color: 'var(--app-secondary-foreground)',
        minHeight: 28,
      }}>
        <span style={{
          fontFamily: 'var(--app-monospace-font-family)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontSize: 'var(--text-xs)',
          opacity: 0.7,
        }}>
          {lang || 'code'}
        </span>
        <button onClick={handleCopy} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'inherit', fontSize: 'var(--text-sm)', opacity: copied ? 1 : 0.5,
          padding: '2px 6px', borderRadius: 4,
          transition: 'opacity 0.15s, background 0.15s',
        }}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre style={{
        margin: 0,
        padding: '14px 16px',
        overflowX: 'auto',
        fontSize: 'var(--app-monospace-font-size)',
        fontFamily: 'var(--app-monospace-font-family)',
        lineHeight: 1.55,
      }}>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

function extractLanguage(className?: string): string | undefined {
  if (!className) return undefined;
  const match = className.match(/language-(\S+)/);
  return match?.[1];
}
