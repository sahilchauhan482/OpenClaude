import type { ChatMessage, RenderableBlock, AgentTaskProgress } from '../../types/chat';
import type { TextBlock, ToolUseBlock, ServerToolUseBlock } from '../../types/messages';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import { ToolCallBlock } from './ToolCallBlock';
import { ToolResultBlockRenderer } from './ToolResultBlock';
import { ContentBlockRouter } from '../blocks/ContentBlockRouter';
import type { ContentBlock, ToolResultBlock } from '../../types/blocks';
import { MessageActions } from './MessageActions';

interface AssistantMessageProps {
  message: ChatMessage;
  isLatest?: boolean;
  isStreaming?: boolean;
  agentTaskProgress?: Record<string, AgentTaskProgress>;
  onRetry?: (uuid: string) => void;
  onStop?: () => void;
}

export function AssistantMessage({ message, isLatest = false, isStreaming = false, agentTaskProgress, onRetry, onStop }: AssistantMessageProps) {
  const blocks = message.blocks || [];
  if (blocks.length === 0) {
    return null;
  }

  // Extract plain text content for copy
  const plainTextContent = blocks
    .filter((b) => b.block.type === 'text')
    .map((b) => (b.block as TextBlock).text)
    .join('\n');

  return (
    <div className="group relative" style={{ width: '100%' }}>
      {/* Message actions (hover) */}
      <div className="absolute top-2 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <MessageActions
          messageRole="assistant"
          content={plainTextContent}
          uuid={message.id}
          isFailed={false}
          isStreaming={isStreaming || message.isStreaming}
          isLatest={isLatest}
          onRetry={onRetry}
          onStop={onStop}
        />
      </div>

      {/* Content blocks — no header/label, just content */}
      <div>
        {blocks.map((renderableBlock) => (
          <BlockRenderer
            key={renderableBlock.index}
            renderableBlock={renderableBlock}
            isMessageStreaming={message.isStreaming}
            agentTaskProgress={agentTaskProgress}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Block Renderer — dispatches to the right renderer per block type
// ============================================================================

interface BlockRendererProps {
  renderableBlock: RenderableBlock;
  isMessageStreaming: boolean;
  agentTaskProgress?: Record<string, AgentTaskProgress>;
}

function BlockRenderer({ renderableBlock, isMessageStreaming: _isMessageStreaming, agentTaskProgress }: BlockRendererProps) {
  const { block, isStreaming } = renderableBlock;

  switch (block.type) {
    case 'text':
      return (
        <MarkdownRenderer
          content={(block as TextBlock).text}
          isStreaming={isStreaming}
        />
      );

    case 'tool_use':
    case 'server_tool_use': {
      const toolBlock = block as ToolUseBlock | ServerToolUseBlock;
      return (
        <ToolCallBlock
          block={toolBlock}
          isStreaming={isStreaming}
          agentProgress={agentTaskProgress?.[toolBlock.id]}
        />
      );
    }

    case 'tool_result':
      return (
        <ToolResultBlockRenderer
          block={block as ToolResultBlock}
          isStreaming={isStreaming}
        />
      );

    case 'thinking':
    case 'redacted_thinking':
    case 'image':
    case 'document':
    case 'search_result':
    case 'web_search_tool_result':
      return (
        <ContentBlockRouter
          block={block as ContentBlock}
          showThinkingSummaries={false}
        />
      );

    default:
      // Unknown block type — show raw JSON as fallback
      return (
        <div className="my-2 text-xs font-mono opacity-40 px-3 py-1.5 rounded border border-vscode-border overflow-x-auto">
          <pre>{JSON.stringify(block, null, 2)}</pre>
        </div>
      );
  }
}

// ============================================================================
// Icons
// ============================================================================
