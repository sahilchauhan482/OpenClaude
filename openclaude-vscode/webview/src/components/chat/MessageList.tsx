import { useEffect } from 'react';
import type { ChatMessage } from '../../types/chat';
import { useAutoScroll } from '../../hooks/useAutoScroll';
import type { ToolActivity } from '../../hooks/useChat';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { SystemMessage } from './SystemMessage';
import { StreamingIndicator } from './StreamingIndicator';
import { ToolProgress } from './ToolProgress';
import { getLiveStatus } from '../../utils/liveStatus';
import { FileEditCard } from './FileEditCard';

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  processState?: 'idle' | 'starting' | 'running' | 'stopped' | 'crashed';
  toolActivity?: ToolActivity | null;
  activeFileEdit?: ChatMessage['fileEdit'] | null;
}

export function MessageList({
  messages,
  isStreaming,
  processState,
  toolActivity = null,
  activeFileEdit = null,
}: MessageListProps) {
  const { containerRef, userScrolledUp, autoScroll, scrollToBottom } = useAutoScroll();
  const liveStatus = getLiveStatus(toolActivity, isStreaming);

  // Auto-scroll when messages change or streaming content updates
  useEffect(() => {
    autoScroll();
  }, [messages, isStreaming, autoScroll]);

  if (messages.length === 0) {
    return (
      <div
        ref={containerRef}
        className="messages-container"
        style={{ justifyContent: 'center', alignItems: 'center' }}
      >
        {processState === 'starting' ? <LoadingState /> : <EmptyState />}
      </div>
    );
  }

  return (
    <div className="flex-1 relative">
      <div
        ref={containerRef}
        className="messages-container"
        style={{ position: 'absolute', inset: 0 }}
      >
        {/* Message list */}
        <div>
          {messages.map((msg) => (
            <div key={msg.id} className="message">
              {msg.role === 'user' ? (
                <UserMessage message={msg} />
              ) : msg.role === 'system' ? (
                msg.fileEdit ? <FileEditCard fileEdit={msg.fileEdit} /> : <SystemMessage text={msg.text ?? ''} />
              ) : (
                <AssistantMessage message={msg} />
              )}
            </div>
          ))}

          {activeFileEdit && (
            <div className="message">
              <FileEditCard fileEdit={activeFileEdit} live={true} />
            </div>
          )}

          {/* Live status â€” keeps the transcript visibly active while the turn runs */}
          {liveStatus && (
            <div className="message">
              {liveStatus.kind === 'tool' ? (
                <div style={{ padding: '4px 12px 2px' }}>
                  <ToolProgress
                    toolName={liveStatus.label}
                    progress={liveStatus.detail}
                  />
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 12px 4px',
                    color: 'var(--app-secondary-foreground)',
                    fontSize: 11,
                    opacity: 0.9,
                  }}
                >
                  <StreamingIndicator visible={true} />
                  <span>{liveStatus.label}</span>
                  {liveStatus.detail && (
                    <span style={{ opacity: 0.6 }}>{liveStatus.detail}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Scroll-to-bottom button when user has scrolled up */}
      {userScrolledUp && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-4 right-4 z-10
            flex items-center gap-1.5 px-3 py-1.5 rounded-full
            bg-vscode-button-bg text-vscode-button-fg text-xs
            shadow-lg hover:bg-vscode-button-hover transition-colors"
          title="Scroll to bottom"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          New content
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state-content" style={{ opacity: 0.4, padding: '0 20px' }}>
        <div style={{ fontSize: '2em', marginBottom: 12 }}>{"{ }"}</div>
        <p style={{ fontSize: '0.85em', fontWeight: 500, marginBottom: 4 }}>No messages yet</p>
        <p style={{ fontSize: '0.75em' }}>Type a message below to start a conversation.</p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="empty-state">
      <div className="empty-state-content" style={{ opacity: 0.5, padding: '0 20px' }}>
        <p style={{ fontSize: '0.85em', fontWeight: 500 }}>Loading session...</p>
      </div>
    </div>
  );
}
