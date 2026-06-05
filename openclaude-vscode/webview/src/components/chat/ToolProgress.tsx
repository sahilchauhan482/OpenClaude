interface ToolProgressProps {
  toolName: string;
  progress?: string;
  isComplete?: boolean;
  summary?: string;
}

/**
 * Renders tool_progress and tool_use_summary as inline indicators.
 * Shows spinner + tool name + progress text during execution.
 * Collapses to summary after completion.
 */
export function ToolProgress({ toolName, progress, isComplete, summary }: ToolProgressProps) {
  if (isComplete && summary) {
    return (
      <div className="tool-progress tool-progress-complete">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
          <path
            d="M2 6l3 3 5-5"
            stroke="var(--app-success-foreground)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>
          <span className="tool-progress-title">{toolName}</span>
          {summary && <span className="tool-progress-copy">{summary}</span>}
        </span>
      </div>
    );
  }

  return (
    <div className="tool-progress tool-progress-live">
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        className="tool-progress-spinner"
      >
        <circle
          cx="6"
          cy="6"
          r="4.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="14 8"
          strokeLinecap="round"
        />
      </svg>
      <span>
        <span className="tool-progress-title">{toolName}</span>
        {progress && <span className="tool-progress-copy">{progress}</span>}
      </span>
    </div>
  );
}
