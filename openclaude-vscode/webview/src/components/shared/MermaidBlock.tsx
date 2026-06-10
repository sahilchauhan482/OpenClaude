import React, { useEffect, useRef, useState } from 'react';
import { CodeBlock } from './CodeBlock';

interface MermaidBlockProps {
  code: string;
}

let mermaidModule: typeof import('mermaid') | null = null;
let mermaidInitialized = false;
let idCounter = 0;

export function MermaidBlock({ code }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        if (!mermaidModule) {
          mermaidModule = await import('mermaid');
        }
        if (!mermaidInitialized) {
          const isDark = document.body.classList.contains('vscode-dark') ||
            document.documentElement.getAttribute('data-vscode-theme-kind') === 'vscode-dark';
          mermaidModule.default.initialize({
            startOnLoad: false,
            theme: isDark ? 'dark' : 'default',
            securityLevel: 'strict',
          });
          mermaidInitialized = true;
        }

        const id = `mermaid-${++idCounter}`;
        const { svg } = await mermaidModule.default.render(id, code);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    renderDiagram();
    return () => { cancelled = true; };
  }, [code]);

  if (showSource || error) {
    return (
      <div className="mermaid-block">
        {error && <div className="mermaid-error">Diagram error: {error}</div>}
        <CodeBlock language="mermaid">{code}</CodeBlock>
        {error && (
          <button className="mermaid-toggle" onClick={() => setShowSource(false)}>
            Retry render
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mermaid-block">
      {loading && <div className="mermaid-loading">Rendering diagram...</div>}
      <div ref={containerRef} className="mermaid-container" />
      <button className="mermaid-toggle" onClick={() => setShowSource(true)}>
        View source
      </button>
    </div>
  );
}
