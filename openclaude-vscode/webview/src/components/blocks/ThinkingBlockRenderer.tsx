import React from 'react';
import type { ThinkingBlock } from '../../types/blocks';

interface ThinkingBlockRendererProps {
  block: ThinkingBlock;
  showSummaries: boolean;
}

export const ThinkingBlockRenderer: React.FC<ThinkingBlockRendererProps> = ({
  block,
  showSummaries,
}) => {
  const displayText = showSummaries && block.summary ? block.summary : block.thinking;
  const label = showSummaries && block.summary ? block.summary : 'Thinking...';

  if (block.isStreaming) {
    return null;
  }

  return (
    <details className="thinking-block thinking-block-complete">
      <summary className="thinking-summary">
        <svg className="thinking-toggle" viewBox="0 0 16 16" fill="currentColor">
          <path d="M6 4l4 4-4 4" />
        </svg>
        <span className="thinking-summary-label">{label}</span>
        <span className="thinking-summary-meta">({block.thinking.length.toLocaleString()} chars)</span>
      </summary>
      <div className="thinking-content thinking-content-complete">
        {displayText}
      </div>
    </details>
  );
};
