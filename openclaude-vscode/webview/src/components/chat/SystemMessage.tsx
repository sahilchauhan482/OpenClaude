import { useEffect, useState } from 'react';
import type { SystemInlineMessageState } from '../../types/chat';

interface SystemMessageProps {
  text: string;
  system?: SystemInlineMessageState;
}

/**
 * Renders inline system messages (api_retry, compact_boundary, recovery notices, etc.)
 * with higher-signal visual treatment than generic secondary text.
 */
export function SystemMessage({ text, system }: SystemMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const tone = system?.tone ?? 'info';
  const label = system?.label ?? badgeLabel(tone);
  const title = system?.title ?? text;
  const detailLines = (system?.detail ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const isCollapsible = Boolean(system?.collapsible || (system?.timeline?.length ?? 0) > 0 || (system?.meta?.length ?? 0) > 0);
  const meta = system?.meta ?? [];
  const timeline = system?.timeline ?? [];

  useEffect(() => {
    if (!isCollapsible) {
      setExpanded(false);
    }
  }, [isCollapsible]);

  return (
    <div
      className={`system-inline-card system-inline-card-${tone}`}
      style={isCollapsible ? { cursor: 'pointer' } : undefined}
      onClick={isCollapsible ? () => setExpanded((prev) => !prev) : undefined}
      role={isCollapsible ? 'button' : undefined}
      aria-expanded={isCollapsible ? expanded : undefined}
      tabIndex={isCollapsible ? 0 : undefined}
      onKeyDown={isCollapsible ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setExpanded((prev) => !prev);
        }
      } : undefined}
    >
      <div className="system-inline-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span className="system-inline-badge">{label}</span>
          <span className="system-inline-title">{title}</span>
        </div>
        {isCollapsible ? (
          <span style={{ fontSize: 11, color: 'var(--app-secondary-foreground)', flexShrink: 0 }}>
            {expanded ? 'Hide details' : 'Show details'}
          </span>
        ) : null}
      </div>
      {detailLines.length > 0 ? (
        <div className="system-inline-detail">
          {detailLines.map((line, index) => (
            <div key={`${line}-${index}`}>{line}</div>
          ))}
        </div>
      ) : null}
      {expanded && meta.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: detailLines.length > 0 ? 10 : 8 }}>
          {meta.map((item, index) => (
            <div
              key={`${item.label}-${item.value}-${index}`}
              style={{
                fontSize: 11,
                color: 'var(--app-secondary-foreground)',
                border: '1px solid var(--app-input-border)',
                borderRadius: 999,
                padding: '4px 8px',
              }}
            >
              {item.label}: {item.value}
            </div>
          ))}
        </div>
      ) : null}
      {expanded && timeline.length > 0 ? (
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          {timeline
            .slice()
            .reverse()
            .map((entry) => (
              <div
                key={entry.id}
                style={{
                  borderLeft: `2px solid ${timelineAccent(entry.tone ?? tone)}`,
                  paddingLeft: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--app-primary-foreground)', fontWeight: 500 }}>
                    {entry.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--app-secondary-foreground)', whiteSpace: 'nowrap' }}>
                    {formatClock(entry.timestamp)}
                  </div>
                </div>
                {entry.detail ? (
                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--app-secondary-foreground)' }}>
                    {entry.detail}
                  </div>
                ) : null}
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}

function badgeLabel(tone: NonNullable<SystemInlineMessageState['tone']>): string {
  switch (tone) {
    case 'warning':
      return 'Recovery';
    case 'error':
      return 'Error';
    case 'success':
      return 'Done';
    case 'info':
    default:
      return 'System';
  }
}

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function timelineAccent(tone: NonNullable<SystemInlineMessageState['tone']>): string {
  switch (tone) {
    case 'success':
      return 'rgba(16, 185, 129, 0.7)';
    case 'warning':
      return 'rgba(245, 158, 11, 0.7)';
    case 'error':
      return 'rgba(239, 68, 68, 0.7)';
    case 'info':
    default:
      return 'rgba(14, 165, 233, 0.7)';
  }
}
