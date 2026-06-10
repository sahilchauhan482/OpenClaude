import { useEffect } from 'react';
import type { ChatMessage, AgentTaskProgress } from '../../types/chat';
import { useAutoScroll } from '../../hooks/useAutoScroll';
import type { ToolActivity } from '../../hooks/useChat';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { SystemMessage } from './SystemMessage';
import { ToolProgress } from './ToolProgress';
import { getLiveStatus } from '../../utils/liveStatus';
import { FileEditCard } from './FileEditCard';

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  processState?: 'idle' | 'starting' | 'running' | 'stopped' | 'crashed';
  toolActivity?: ToolActivity | null;
  activeFileEdit?: ChatMessage['fileEdit'] | null;
  agentTaskProgress?: Record<string, AgentTaskProgress>;
}

export function MessageList({
  messages,
  isStreaming,
  processState,
  toolActivity = null,
  activeFileEdit = null,
  agentTaskProgress,
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
        <div>
          {messages.map((msg) => (
            <div key={msg.id} className="message">
              {msg.role === 'user' ? (
                <UserMessage message={msg} />
              ) : msg.role === 'system' ? (
                msg.fileEdit ? <FileEditCard fileEdit={msg.fileEdit} /> : <SystemMessage text={msg.text ?? ''} system={msg.system} />
              ) : (
                <AssistantMessage message={msg} agentTaskProgress={agentTaskProgress} />
              )}
            </div>
          ))}

          {activeFileEdit && (
            <div className="message">
              <FileEditCard fileEdit={activeFileEdit} live={true} />
            </div>
          )}

          {liveStatus && (
            <div className="message">
              <div className="live-status-card live-status-card-tool">
                <ToolProgress
                  toolName={liveStatus.headline}
                  progress={liveStatus.detail}
                />
                <div className="live-status-subline">
                  <span className="live-status-chip">{liveStatus.label}</span>
                  {liveStatus.ticker ? <span>{liveStatus.ticker}</span> : null}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {userScrolledUp && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="scroll-to-bottom"
          title="Scroll to bottom"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          New content
        </button>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state-content">
        <div className="empty-state-card">
          <div className="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div className="empty-state-heading">What can I help you build?</div>
          <div className="empty-state-subtitle">Ask me to write code, fix bugs, explain concepts, or refactor your project.</div>
          <div className="empty-state-chips">
            <span className="empty-state-chip">Fix a bug</span>
            <span className="empty-state-chip">Write tests</span>
            <span className="empty-state-chip">Explain code</span>
            <span className="empty-state-chip">Refactor</span>
          </div>
          <div className="empty-state-hint">Type a message or press / for commands</div>
        </div>
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
