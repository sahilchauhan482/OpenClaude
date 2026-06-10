import type { TodoItem } from '../../utils/toolPresentation';

interface TodoProgressCardProps {
  todos: TodoItem[];
  isStreaming: boolean;
}

export function TodoProgressCard({ todos, isStreaming }: TodoProgressCardProps) {
  const completed = todos.filter(t => t.status === 'completed').length;
  const inProgress = todos.filter(t => t.status === 'in_progress').length;
  const total = todos.length;
  const progress = total > 0 ? completed / total : 0;

  const allDone = completed === total && total > 0;
  const barColor = allDone
    ? 'var(--app-success-foreground, #22c55e)'
    : 'var(--vscode-charts-blue, #3b82f6)';

  return (
    <div style={{
      padding: '10px 12px',
      display: 'grid',
      gap: 10,
    }}>
      {/* Progress bar + stats */}
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
        }}>
          <span style={{
            fontWeight: 600,
            color: 'var(--app-primary-foreground, var(--vscode-editor-foreground))',
          }}>
            {allDone ? 'All tasks completed' : `${completed} of ${total} completed`}
          </span>
          <div style={{
            display: 'flex',
            gap: 8,
            color: 'var(--app-secondary-foreground, var(--vscode-descriptionForeground))',
            fontSize: 10,
          }}>
            {inProgress > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'var(--vscode-charts-blue, #3b82f6)',
                  animation: 'todo-pulse 1.5s ease-in-out infinite',
                }} />
                {inProgress} active
              </span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{
          height: 4,
          borderRadius: 2,
          background: 'var(--vscode-editor-background, rgba(255,255,255,0.06))',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${Math.round(progress * 100)}%`,
            borderRadius: 2,
            background: barColor,
            transition: 'width 400ms cubic-bezier(0.16, 1, 0.3, 1)',
          }} />
        </div>
      </div>

      {/* Task list */}
      <div style={{ display: 'grid', gap: 2 }}>
        {todos.map((todo, i) => (
          <TodoRow key={`${i}-${todo.content}`} todo={todo} isStreaming={isStreaming} />
        ))}
      </div>

      <style>{`
        @keyframes todo-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes todo-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function TodoRow({ todo, isStreaming }: { todo: TodoItem; isStreaming: boolean }) {
  const isActive = todo.status === 'in_progress';
  const isDone = todo.status === 'completed';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      padding: '4px 0',
      opacity: isDone ? 0.55 : 1,
    }}>
      <span style={{
        flexShrink: 0,
        marginTop: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
      }}>
        {isDone ? (
          <CompletedIcon />
        ) : isActive ? (
          <ActiveIcon spinning={isStreaming} />
        ) : (
          <PendingIcon />
        )}
      </span>

      <span style={{
        fontSize: 11.5,
        lineHeight: '18px',
        color: isActive
          ? 'var(--app-primary-foreground, var(--vscode-editor-foreground))'
          : 'var(--app-primary-foreground, var(--vscode-editor-foreground))',
        textDecoration: isDone ? 'line-through' : 'none',
        fontWeight: isActive ? 500 : 400,
      }}>
        {isActive && todo.activeForm ? todo.activeForm : todo.content}
      </span>
    </div>
  );
}

function CompletedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="var(--app-success-foreground, #22c55e)" opacity="0.15" />
      <path
        d="M8 12.5l2.5 2.5 5.5-5.5"
        stroke="var(--app-success-foreground, #22c55e)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ActiveIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: spinning ? 'todo-spin 1.2s linear infinite' : 'none' }}
    >
      <circle cx="12" cy="12" r="10" stroke="var(--vscode-charts-blue, #3b82f6)" strokeWidth="2" opacity="0.2" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="var(--vscode-charts-blue, #3b82f6)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PendingIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle
        cx="12" cy="12" r="9"
        stroke="var(--app-secondary-foreground, var(--vscode-descriptionForeground))"
        strokeWidth="1.5"
        opacity="0.35"
      />
    </svg>
  );
}
