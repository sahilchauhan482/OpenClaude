import type { AttachmentItem } from '../../types/attachments';

export interface AttachmentBarProps {
  attachments: AttachmentItem[];
  onRemove: (index: number) => void;
}

/**
 * Horizontal list of attached files/images/URLs with remove buttons.
 * Appears above the textarea when there are attachments.
 */
export function AttachmentBar({ attachments, onRemove }: AttachmentBarProps) {
  if (attachments.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      padding: '8px 12px',
      borderBottom: '1px solid var(--app-input-border)',
    }}>
      {attachments.map((attachment, index) => (
        <div
          key={`${attachment.name}-${index}`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            width: 124,
            padding: 8,
            borderRadius: 14,
            background: 'var(--vscode-editorWidget-background)',
            border: '1px solid var(--app-input-border)',
            fontSize: 12,
            boxShadow: '0 6px 18px rgba(0, 0, 0, 0.16)',
          }}
          className="group"
        >
          {/* Image thumbnail */}
          {attachment.type === 'image' && attachment.content.startsWith('data:') ? (
            <img
              src={attachment.content}
              alt={attachment.name}
              style={{ width: '100%', height: 72, objectFit: 'cover', borderRadius: 10 }}
            />
          ) : (
            <span style={{ opacity: 0.6, fontSize: 18, alignSelf: 'center' }}>
              {attachment.type === 'image' ? 'IMG' : attachment.type === 'url' ? 'URL' : 'FILE'}
            </span>
          )}

          {/* File name */}
          <span style={{
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--app-primary-foreground)',
          }}>
            {attachment.name}
          </span>

          {/* Remove button */}
          <button
            onClick={() => onRemove(index)}
            title={`Remove ${attachment.name}`}
            aria-label={`Remove ${attachment.name}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 16,
              height: 16,
              borderRadius: 4,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: 0,
              opacity: 0.6,
              color: 'var(--app-primary-foreground)',
              alignSelf: 'flex-end',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.6'; }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
