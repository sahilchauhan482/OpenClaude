import { useState } from 'react';
import type { ToolUseBlock, ServerToolUseBlock } from '../../types/messages';
import { CodeBlock } from '../shared/CodeBlock';
import {
  getToolPresentation,
} from '../../utils/toolPresentation';

interface ToolCallBlockProps {
  block: ToolUseBlock | ServerToolUseBlock;
  isStreaming: boolean;
}

export function ToolCallBlock({ block, isStreaming }: ToolCallBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const presentation = getToolPresentation(block.name, block.input);
  const hasInput = Object.keys(block.input).length > 0;
  const statusLabel = isStreaming ? 'Running' : 'Completed';

  return (
    <div className={`tool-call-card ${isStreaming ? 'tool-call-card-live' : ''}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="tool-call-button"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`tool-call-chevron ${isExpanded ? 'rotate-90' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>

        <ToolIcon />

        <div className="tool-call-copy">
          <div className="tool-call-topline">
            <span className="tool-call-title">{presentation.title}</span>
            <DeltaChips delta={presentation.delta} />
          </div>
          <div className="tool-call-summary">
            {presentation.summary}
          </div>
          {presentation.detail && (
            <div className="tool-call-detail">
              {presentation.detail}
            </div>
          )}
        </div>

        <span className={`tool-call-status ${isStreaming ? 'tool-call-status-live' : ''}`}>
          <span className="tool-call-status-dot" />
          {statusLabel}
        </span>
      </button>

      {isExpanded && (
        <div className="tool-call-expanded">
          <ExpandedToolContent presentation={presentation} hasInput={hasInput} />
        </div>
      )}
    </div>
  );
}

function ExpandedToolContent({
  presentation,
  hasInput,
}: {
  presentation: ReturnType<typeof getToolPresentation>;
  hasInput: boolean;
}) {
  if (!hasInput) {
    return <div style={{ fontSize: 11, opacity: 0.4, fontStyle: 'italic' }}>No input</div>;
  }

  if (presentation.kind === 'command' && presentation.code) {
    return (
      <Section label="Command">
        <CodeBlock language={presentation.language}>
          {presentation.code}
        </CodeBlock>
      </Section>
    );
  }

  if (presentation.kind === 'file') {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        {presentation.filePath && (
          <Section label="Target file">
            <InlinePath path={presentation.filePath} />
          </Section>
        )}

        {presentation.hunks && presentation.hunks.length > 0 ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {presentation.hunks.map((hunk, index) => (
              <div key={`${index}-${hunk.removed}-${hunk.added}`} style={{ display: 'grid', gap: 8 }}>
                {presentation.hunks!.length > 1 ? (
                  <div style={{ fontSize: 11, opacity: 0.55, textTransform: 'uppercase' }}>
                    Change {index + 1}
                  </div>
                ) : null}
                {hunk.removed ? (
                  <DiffPanel label="Removing" tone="removed" code={hunk.removed} language={presentation.language} />
                ) : null}
                {hunk.added ? (
                  <DiffPanel label="Adding" tone="added" code={hunk.added} language={presentation.language} />
                ) : null}
              </div>
            ))}
          </div>
        ) : presentation.code ? (
          <Section label="New content">
            <CodeBlock language={presentation.language}>
              {presentation.code}
            </CodeBlock>
          </Section>
        ) : (
          <Section label="Input">
            <CodeBlock language={presentation.language ?? 'json'}>
              {presentation.rawInput}
            </CodeBlock>
          </Section>
        )}
      </div>
    );
  }

  if (presentation.code) {
    return (
      <Section label="Input">
        <CodeBlock language={presentation.language}>
          {presentation.code}
        </CodeBlock>
      </Section>
    );
  }

  return (
    <Section label="Input">
      <CodeBlock language="json">
        {presentation.rawInput}
      </CodeBlock>
    </Section>
  );
}

function DeltaChips({
  delta,
}: {
  delta: ReturnType<typeof getToolPresentation>['delta'];
}) {
  if (!delta) {
    return null;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {delta.additions > 0 ? (
        <Badge tone="added" text={`${delta.approximate ? '~' : ''}+${delta.additions}`} />
      ) : null}
      {delta.deletions > 0 ? (
        <Badge tone="removed" text={`${delta.approximate ? '~' : ''}-${delta.deletions}`} />
      ) : null}
    </div>
  );
}

function Badge({ tone, text }: { tone: 'added' | 'removed'; text: string }) {
  const color = tone === 'added'
    ? 'var(--app-success-foreground)'
    : 'var(--app-error-foreground)';

  return (
    <span
      style={{
        fontSize: 11,
        fontFamily: 'var(--app-monospace-font-family)',
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        borderRadius: 999,
        padding: '1px 8px',
      }}
    >
      {text}
    </span>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );
}

function InlinePath({ path }: { path: string }) {
  return (
    <div
      style={{
        fontFamily: 'var(--app-monospace-font-family)',
        fontSize: 12,
        padding: '6px 8px',
        borderRadius: 8,
        background: 'var(--vscode-editor-background)',
        overflowX: 'auto',
      }}
    >
      {path}
    </div>
  );
}

function DiffPanel({
  label,
  tone,
  code,
  language,
}: {
  label: string;
  tone: 'added' | 'removed';
  code: string;
  language?: string;
}) {
  const color = tone === 'added'
    ? 'var(--app-success-foreground)'
    : 'var(--app-error-foreground)';

  return (
    <div
      style={{
        border: `1px solid color-mix(in srgb, ${color} 34%, transparent)`,
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '4px 8px',
          fontSize: 11,
          fontWeight: 600,
          color,
          background: `color-mix(in srgb, ${color} 12%, transparent)`,
        }}
      >
        {label}
      </div>
      <div style={{ background: 'var(--vscode-editor-background)' }}>
        <CodeBlock language={language}>
          {code}
        </CodeBlock>
      </div>
    </div>
  );
}

function ToolIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="opacity-60"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
