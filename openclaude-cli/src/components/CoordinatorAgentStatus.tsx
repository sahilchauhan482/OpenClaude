import figures from 'figures';
import * as React from 'react';
import { BLACK_CIRCLE, PAUSE_ICON, PLAY_ICON } from '../constants/figures.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { stringWidth } from '../ink/stringWidth.js';
import { Box, Text, wrapText } from '../ink.js';
import { type AppState, useAppState, useSetAppState } from '../state/AppState.js';
import { enterTeammateView, exitTeammateView } from '../state/teammateViewHelpers.js';
import { isPanelAgentTask, type LocalAgentTaskState } from '../tasks/LocalAgentTask/LocalAgentTask.js';
import { formatDuration, formatNumber } from '../utils/format.js';
import { evictTerminalTask } from '../utils/task/framework.js';
import { isTerminalStatus } from './tasks/taskStatusUtils.js';
import { useSpinner } from '../hooks/useSpinner.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function getVisibleAgentTasks(tasks: AppState['tasks']): LocalAgentTaskState[] {
  return Object.values(tasks)
    .filter((t): t is LocalAgentTaskState => isPanelAgentTask(t) && t.evictAfter !== 0)
    .sort((a, b) => a.startTime - b.startTime);
}

export function CoordinatorTaskPanel(): React.ReactNode {
  const tasks = useAppState(s => s.tasks);
  const viewingAgentTaskId = useAppState(s => s.viewingAgentTaskId);
  const agentNameRegistry = useAppState(s => s.agentNameRegistry);
  const coordinatorTaskIndex = useAppState(s => s.coordinatorTaskIndex);
  const tasksSelected = useAppState(s => s.footerSelection === 'tasks');
  const selectedIndex = tasksSelected ? coordinatorTaskIndex : undefined;
  const setAppState = useSetAppState();
  const visibleTasks = getVisibleAgentTasks(tasks);
  const hasTasks = Object.values(tasks).some(isPanelAgentTask);

  const tasksRef = React.useRef(tasks);
  tasksRef.current = tasks;
  const [, setTick] = React.useState(0);

  React.useEffect(() => {
    if (!hasTasks) return;
    const interval = setInterval(() => {
      const now = Date.now();
      for (const t of Object.values(tasksRef.current)) {
        if (isPanelAgentTask(t) && (t.evictAfter ?? Infinity) <= now) {
          evictTerminalTask(t.id, setAppState);
        }
      }
      setTick(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [hasTasks, setAppState]);

  const nameByAgentId = React.useMemo(() => {
    const inv = new Map<string, string>();
    for (const [n, id] of agentNameRegistry) inv.set(id, n);
    return inv;
  }, [agentNameRegistry]);

  if (visibleTasks.length === 0) return null;

  return (
    <Box flexDirection="column" marginTop={1}>
      <MainLine 
        isSelected={selectedIndex === 0} 
        isViewed={viewingAgentTaskId === undefined} 
        onClick={() => exitTeammateView(setAppState)} 
      />
      {visibleTasks.map((task, i) => (
        <AgentLine 
          key={task.id} 
          task={task} 
          name={nameByAgentId.get(task.id)} 
          isSelected={selectedIndex === i + 1} 
          isViewed={viewingAgentTaskId === task.id} 
          onClick={() => enterTeammateView(task.id, setAppState)} 
        />
      ))}
    </Box>
  );
}

export function useCoordinatorTaskCount() {
  const tasks = useAppState(s => s.tasks);
  return getVisibleAgentTasks(tasks).length;
}

function MainLine({ isSelected, isViewed, onClick }: { isSelected: boolean, isViewed: boolean, onClick: () => void }) {
  const [hover, setHover] = React.useState(false);
  const prefix = isSelected || hover ? figures.pointer + " " : "  ";
  const bullet = isViewed ? BLACK_CIRCLE : figures.circle;
  const dim = !isSelected && !isViewed && !hover;
  
  return (
    <Box onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <Text dimColor={dim} bold={isViewed}>{prefix}{bullet} main</Text>
    </Box>
  );
}

type AgentLineProps = {
  task: LocalAgentTaskState;
  name?: string;
  isSelected?: boolean;
  isViewed?: boolean;
  onClick?: () => void;
};

function AgentLine({ task, name, isSelected, isViewed, onClick }: AgentLineProps) {
  const { columns } = useTerminalSize();
  const [hover, setHover] = React.useState(false);
  const frame = useSpinner();
  
  const isRunning = !isTerminalStatus(task.status);
  const pausedMs = task.totalPausedMs ?? 0;
  const elapsedMs = Math.max(0, isRunning ? Date.now() - task.startTime - pausedMs : (task.endTime ?? task.startTime) - task.startTime - pausedMs);
  const elapsed = formatDuration(elapsedMs);
  
  const tokenCount = task.progress?.tokenCount;
  const lastActivity = task.progress?.lastActivity;
  const arrow = lastActivity ? figures.arrowDown : figures.arrowUp;
  const tokenText = tokenCount !== undefined && tokenCount > 0 ? ` · ${arrow} ${formatNumber(tokenCount)} tokens` : "";
  
  const queuedCount = task.pendingMessages.length;
  const queuedText = queuedCount > 0 ? ` · ${queuedCount} queued` : "";
  const displayDescription = task.progress?.summary || task.description;
  
  const highlighted = isSelected || hover;
  const prefix = highlighted ? figures.pointer + " " : "  ";
  
  // Use spinner instead of static bullet when running!
  const spinnerChar = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
  const bullet = isViewed ? BLACK_CIRCLE : (isRunning ? spinnerChar : figures.circle);
  
  const dim = !highlighted && !isViewed;
  const sep = isRunning ? PLAY_ICON : PAUSE_ICON;
  const namePart = name ? `${name}: ` : "";
  const hintPart = isSelected && !isViewed ? ` · x to ${isRunning ? "stop" : "clear"}` : "";
  const suffixPart = ` ${sep} ${elapsed}${tokenText}${queuedText}${hintPart}`;
  
  const availableForDesc = columns - stringWidth(prefix) - stringWidth(`${bullet} `) - stringWidth(namePart) - stringWidth(suffixPart);
  const truncated = wrapText(displayDescription, Math.max(0, availableForDesc), "truncate-end");
  
  const line = (
    <Text dimColor={dim} bold={isViewed}>
      {prefix}
      {isRunning ? <Text color="claude">{bullet}</Text> : bullet}
      {" "}
      {name && <><Text dimColor={false} bold={true}>{name}</Text>{": "}</>}
      {truncated} {sep} {elapsed}{tokenText}
      {queuedCount > 0 && <Text color="warning">{queuedText}</Text>}
      {hintPart && <Text dimColor={true}>{hintPart}</Text>}
    </Text>
  );
  
  if (!onClick) return line;
  
  return (
    <Box onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {line}
    </Box>
  );
}
