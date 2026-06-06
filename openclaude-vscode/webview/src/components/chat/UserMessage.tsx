import type { ChatMessage } from '../../types/chat';
import type { AttachmentItem } from '../../types/attachments';
import { MessageActions } from './MessageActions';

interface UserMessageProps {
  message: ChatMessage;
  onEdit?: (uuid: string, newContent: string) => void;
}

/**
 * User message bubble — exact Claude Code styling:
 * .userMessageContainer_07S1Yg: display:inline-block; position:relative; margin:4px 0
 * .userMessage_07S1Yg: white-space:pre-wrap; border:1px solid var(--app-input-border);
 *   border-radius:6px; background:var(--app-input-background); padding:4px 6px
 */
export function UserMessage({ message, onEdit }: UserMessageProps) {
  const attachments = message.attachments ?? [];
  const messageText = message.text ?? '';
  const shouldShowTextBubble =
    Boolean(messageText) &&
    !/^\[(?:\d+\s+)?images?\s+attached\]$/i.test(messageText.trim());
  return (
    <div style={{ textAlign: 'left', position: 'relative', width: '100%' }}>
      <div className="group" style={{ display: 'inline-block', position: 'relative', margin: '4px 0' }}>
        {attachments.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <AttachmentPreviewGrid attachments={attachments} />
          </div>
        )}
        {shouldShowTextBubble && (
          <div className="user-message-bubble">
            {messageText}
          </div>
        )}
        <div className="flex justify-end mt-1">
          <MessageActions
            messageRole="user"
            content={messageText}
            uuid={message.id}
            onEdit={onEdit}
          />
        </div>
      </div>
    </div>
  );
}

function AttachmentPreviewGrid({ attachments }: { attachments: AttachmentItem[] }) {
  const imageAttachments = attachments.filter((attachment) => attachment.type === 'image');
  const otherAttachments = attachments.filter((attachment) => attachment.type !== 'image');

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 180px))',
      gap: 8,
      maxWidth: '100%',
    }}>
      {imageAttachments.map((attachment, index) => (
        <AttachmentTile key={`${attachment.name}-${index}`} attachment={attachment} />
      ))}
      {otherAttachments.map((attachment, index) => (
        <div
          key={`${attachment.name}-${index}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: 10,
            borderRadius: 14,
            border: '1px solid var(--app-border)',
            background: 'var(--vscode-editorWidget-background)',
            minHeight: 48,
          }}
        >
          <span style={{ fontSize: 18, opacity: 0.7 }}>
            {attachment.type === 'url' ? '🌐' : '📄'}
          </span>
          <span style={{
            fontSize: 12,
            color: 'var(--app-primary-foreground)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {attachment.name}
          </span>
        </div>
      ))}
    </div>
  );
}

function AttachmentTile({ attachment }: { attachment: AttachmentItem }) {
  const isDataImage = attachment.type === 'image' && attachment.content.startsWith('data:');
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 16,
        border: '1px solid var(--app-border)',
        background: 'var(--vscode-editorWidget-background)',
        boxShadow: '0 8px 20px rgba(0, 0, 0, 0.22)',
      }}
    >
      {isDataImage ? (
        <img
          src={attachment.content}
          alt={attachment.name}
          style={{
            display: 'block',
            width: '100%',
            maxHeight: 220,
            objectFit: 'cover',
            background: 'var(--vscode-editor-background)',
          }}
          loading="lazy"
        />
      ) : (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 140,
          color: 'var(--app-secondary-foreground)',
          fontSize: 13,
          padding: 12,
          textAlign: 'center',
        }}>
          {attachment.name}
        </div>
      )}
      <div style={{
        padding: '8px 10px',
        fontSize: 11,
        color: 'var(--app-secondary-foreground)',
        background: 'linear-gradient(to top, rgba(0,0,0,0.28), transparent)',
      }}>
        {attachment.name}
      </div>
    </div>
  );
}
