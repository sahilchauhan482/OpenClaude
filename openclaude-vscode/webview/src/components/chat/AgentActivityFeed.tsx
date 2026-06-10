import { useState } from 'react';
import type { AgentTaskProgress } from '../../types/chat';
import { formatElapsedTime, formatTokenCount } from '../../utils/agentProgress';

interface AgentActivityFeedProps {
  progress: AgentTaskProgress;
}

export function AgentActivityFeed({ progress }: AgentActivityFeedProps) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = progress.status === 'running';
  const isFailed = progress.status === 'failed';

  const statusColor = isRunning
    ? 'var(--vscode-charts-blue, #3b82f6)'
    : isFailed
      ? 'var(--app-error-foreground, #ef4444)'
      : 'var(--app-success-foreground, #22c55e)';

  const elapsed = isRunning
    ? formatElapsedTime(Date.now() - progress.startTime)
    : formatElapsedTime(progress.durationMs);

  return (
    <div
      style={{
        marginTop: 6,
        borderLeft: `2px solid ${statusColor}`,
        borderRadius: '0 8px 8px 0',
        background: `color-mix(in srgb, ${statusColor} 6%, transparent)`,
        overflow: 'hidden',
      }}
    >
      {/* Collapsed: current activity line */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 10px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'inherit',
          font: 'inherit',
        }}
      >
        {/* Pulse dot */}
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: statusColor,
            flexShrink: 0,
            animation: isRunning ? 'agent-pulse 1.5s ease-in-out infinite' : 'none',
          }}
        />

        {/* Activity text */}
        <span
          style={{
            flex: 1,
            fontSize: 11,
            color: 'var(--app-primary-foreground, var(--vscode-editor-foreground))',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {progress.progressNote || progress.description}
        </span>

        {/* Metrics */}
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 10,
            color: 'var(--app-secondary-foreground, var(--vscode-descriptionForeground))',
            flexShrink: 0,
          }}
        >
          {progress.toolUses > 0 && (
            <span title="Operations">{progress.toolUses} ops</span>
          )}
          {progress.tokenCount > 0 && (
            <span title="Tokens">{formatTokenCount(progress.tokenCount)} tok</span>
          )}
          <span title="Elapsed time">{elapsed}</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 150ms ease',
            }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      </button>

      {/* Expanded: event timeline */}
      {expanded && progress.events.length > 0 && (
        <div
          style={{
            padding: '0 10px 8px 24px',
            display: 'grid',
            gap: 2,
          }}
        >
          {progress.events.map((event, index) => {
            const isLast = index === progress.events.length - 1;
            const eventAge = Date.now() - event.timestamp;
            const ago = eventAge < 5000 ? 'just now' : `${formatElapsedTime(eventAge)} ago`;

            return (
              <div
                key={`${event.timestamp}-${index}`}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  fontSize: 10,
                  opacity: isLast ? 1 : 0.7,
                }}
              >
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: isLast ? statusColor : 'var(--app-secondary-foreground)',
                    flexShrink: 0,
                    alignSelf: 'center',
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    color: 'var(--app-primary-foreground)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {event.label}
                </span>
                <span
                  style={{
                    color: 'var(--app-secondary-foreground)',
                    flexShrink: 0,
                  }}
                >
                  {ago}
                </span>
              </div>
            );
          })}

          {/* Final summary when completed */}
          {!isRunning && progress.summary && (
            <div
              style={{
                marginTop: 4,
                padding: '5px 8px',
                fontSize: 11,
                borderRadius: 6,
                background: `color-mix(in srgb, ${statusColor} 10%, transparent)`,
                color: 'var(--app-primary-foreground)',
                lineHeight: 1.4,
              }}
            >
              {progress.summary}
            </div>
          )}
        </div>
      )}

      {/* CSS animation for pulse */}
      <style>{`
        @keyframes agent-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
