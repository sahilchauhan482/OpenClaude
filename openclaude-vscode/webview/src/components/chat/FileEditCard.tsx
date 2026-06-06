import { useState } from 'react';
import type { FileEditMessageState } from '../../types/chat';
import { vscode } from '../../vscode';

interface FileEditCardProps {
  fileEdit: FileEditMessageState;
  live?: boolean;
}

function stageLabel(stage: FileEditMessageState['stage']): string {
  if (stage === 'reviewing') return 'Review';
  if (stage === 'applied') return 'Edited';
  return 'Rejected';
}

export function FileEditCard({ fileEdit, live = false }: FileEditCardProps) {
  const [expanded, setExpanded] = useState(fileEdit.stage === 'reviewing');
  const preview = fileEdit.preview;
  const hasPreview = preview
    && (
      preview.contextBefore.length > 0 ||
      preview.removed.length > 0 ||
      preview.added.length > 0 ||
      preview.contextAfter.length > 0
    );

  return (
    <div
      className="my-2 rounded-xl border overflow-hidden"
      style={{
        borderColor: 'var(--app-border)',
        background: live
          ? 'color-mix(in srgb, var(--vscode-editorWidget-background) 84%, var(--vscode-focusBorder) 16%)'
          : 'var(--vscode-editorWidget-background)',
      }}
    >
      <button
        onClick={() => setExpanded((value) => !value)}
        className="w-full px-3 py-2 text-left"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'transparent',
          border: 'none',
          color: 'var(--vscode-editor-foreground)',
          cursor: 'pointer',
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 120ms ease',
            opacity: 0.7,
            flexShrink: 0,
          }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{stageLabel(fileEdit.stage)}</span>
            {live ? (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  color: 'var(--vscode-focusBorder)',
                }}
              >
                Live
              </span>
            ) : null}
            <span
              style={{
                fontSize: 12,
                opacity: 0.92,
                fontFamily: 'var(--app-monospace-font-family)',
              }}
            >
              {fileEdit.fileName}
            </span>
            {fileEdit.additions > 0 ? (
              <DeltaBadge tone="added" text={`+${fileEdit.additions}`} />
            ) : null}
            {fileEdit.deletions > 0 ? (
              <DeltaBadge tone="removed" text={`-${fileEdit.deletions}`} />
            ) : null}
          </div>
          <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
            {fileEdit.filePath}
          </div>
        </div>

        <span style={{ fontSize: 11, opacity: 0.65 }}>
          {expanded ? 'Hide' : 'Review'}
        </span>
      </button>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderTop: expanded && hasPreview ? '1px solid var(--app-border)' : 'none',
          padding: expanded && hasPreview ? '0 12px 8px' : '0 12px 10px',
        }}
      >
        <button
          onClick={() => vscode.postMessage({ type: 'open_file', filePath: fileEdit.filePath })}
          title="Open edited file"
          style={{
            border: '1px solid var(--app-input-border)',
            borderRadius: 'var(--corner-radius-small)',
            background: 'transparent',
            color: 'var(--app-primary-foreground)',
            cursor: 'pointer',
            fontSize: 11,
            padding: '2px 8px',
          }}
        >
          Open file
        </button>
        <span style={{ fontSize: 11, color: 'var(--app-secondary-foreground)' }}>
          {fileEdit.additions} added, {fileEdit.deletions} removed
        </span>
      </div>

      {expanded && hasPreview && preview && (
        <div
          style={{
            borderTop: '1px solid var(--app-border)',
            background: 'var(--vscode-editor-background)',
            padding: '8px 0',
          }}
        >
          <DiffLines lines={preview.contextBefore} prefix=" " tone="context" />
          <DiffLines lines={preview.removed} prefix="-" tone="removed" />
          <DiffLines lines={preview.added} prefix="+" tone="added" />
          <DiffLines lines={preview.contextAfter} prefix=" " tone="context" />
          {preview.truncated && (
            <div
              style={{
                padding: '4px 12px 0',
                fontSize: 11,
                opacity: 0.6,
              }}
            >
              Preview truncated
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DeltaBadge({ tone, text }: { tone: 'added' | 'removed'; text: string }) {
  const color = tone === 'added'
    ? 'var(--app-success-foreground)'
    : 'var(--app-error-foreground)';

  return (
    <span
      style={{
        fontSize: 11,
        color,
        fontFamily: 'var(--app-monospace-font-family)',
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        borderRadius: 999,
        padding: '1px 8px',
      }}
    >
      {text}
    </span>
  );
}

function DiffLines({
  lines,
  prefix,
  tone,
}: {
  lines: string[];
  prefix: string;
  tone: 'context' | 'removed' | 'added';
}) {
  if (lines.length === 0) {
    return null;
  }

  const background =
    tone === 'removed'
      ? 'color-mix(in srgb, var(--app-error-foreground) 14%, transparent)'
      : tone === 'added'
        ? 'color-mix(in srgb, var(--app-success-foreground) 14%, transparent)'
        : 'transparent';
  const color =
    tone === 'removed'
      ? 'var(--app-error-foreground)'
      : tone === 'added'
        ? 'var(--app-success-foreground)'
        : 'var(--vscode-editor-foreground)';

  return (
    <div>
      {lines.map((line, index) => (
        <div
          key={`${prefix}-${index}-${line}`}
          style={{
            display: 'grid',
            gridTemplateColumns: '18px minmax(0, 1fr)',
            gap: 8,
            padding: '1px 12px',
            background,
            color,
            fontSize: 12,
            fontFamily: 'var(--app-monospace-font-family)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          <span style={{ opacity: 0.72 }}>{prefix}</span>
          <span>{line || ' '}</span>
        </div>
      ))}
    </div>
  );
}
