import React, { useState } from 'react';
import type { ToolResultBlock } from '../../types/blocks';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';

interface ToolResultBlockProps {
  block: ToolResultBlock;
  isStreaming: boolean;
}

export function ToolResultBlockRenderer({ block, isStreaming }: ToolResultBlockProps) {
  const [isExpanded, setIsExpanded] = useState(block.is_error || block.content.length <= 600);
  const hasContent = block.content.trim().length > 0;

  return (
    <div className="my-2 rounded-md border border-vscode-border overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm
          bg-[var(--vscode-editorGroupHeader-tabsBackground)]
          hover:bg-[var(--vscode-list-hoverBackground)]
          transition-colors"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>

        <ToolResultIcon />

        <span className="font-mono text-xs font-medium">tool result</span>

        {block.is_error ? (
          <span className="ml-1 text-xs text-red-400">error</span>
        ) : (
          <span className="ml-1 text-xs opacity-50">
            {isStreaming ? 'Running' : 'Done'}
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="px-3 py-2 border-t border-vscode-border">
          {hasContent ? (
            <MarkdownRenderer content={block.content} />
          ) : (
            <div className="text-xs opacity-40 italic">No output</div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolResultIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="opacity-60"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
