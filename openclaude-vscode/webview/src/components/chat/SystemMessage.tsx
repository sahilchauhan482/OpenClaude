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
  const title = system?.title ?? text;
  const detail = system?.detail;

  return (
    <div className={`system-inline-card system-inline-card-${tone}`}>
      <div className="system-inline-header">
        <span className="system-inline-badge">{badgeLabel(tone)}</span>
        <span className="system-inline-title">{title}</span>
      </div>
      {detail && detail !== title ? (
        <div className="system-inline-detail">{detail}</div>
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
