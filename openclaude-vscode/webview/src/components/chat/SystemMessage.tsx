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
  const tone = system?.tone ?? 'info';
  const label = system?.label ?? badgeLabel(tone);
  const title = system?.title ?? text;
  const detailLines = (system?.detail ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className={`system-inline-card system-inline-card-${tone}`}>
      <div className="system-inline-header">
        <span className="system-inline-badge">{label}</span>
        <span className="system-inline-title">{title}</span>
      </div>
      {detailLines.length > 0 ? (
        <div className="system-inline-detail">
          {detailLines.map((line, index) => (
            <div key={`${line}-${index}`}>{line}</div>
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
