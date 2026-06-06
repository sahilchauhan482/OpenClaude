import type {
  SDKPostTurnSummaryMessage,
  SDKTaskNotificationMessage,
  SDKTaskProgressMessage,
  SDKTaskStartedMessage,
} from '../types/messages';

export type AgentTeamMode = 'off' | 'assist' | 'coordinate';

export interface AgentTeamSettings {
  mode: AgentTeamMode;
  maxWorkers: number;
  useWorktrees: boolean;
}

export interface AgentTeamContext {
  worktreeAvailable: boolean;
  currentWorktreeName?: string | null;
}

export interface AgentTeamTaskState {
  id: string;
  description: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  taskType?: string;
  workflowName?: string;
  prompt?: string;
  summary?: string;
  progressNote?: string;
  lastToolName?: string;
  toolUses: number;
  tokenCount: number;
  durationMs: number;
  duplicateDescription?: boolean;
  writeHeavy?: boolean;
}

export interface AgentTeamSummaryState {
  id: string;
  title: string;
  statusCategory: 'blocked' | 'waiting' | 'completed' | 'review_ready' | 'failed';
  description: string;
  recentAction: string;
  needsAction: string;
}

export interface AgentTeamBoardState {
  enabled: boolean;
  mode: AgentTeamMode;
  maxWorkers: number;
  useWorktrees: boolean;
  worktreeAvailable: boolean;
  currentWorktreeName?: string | null;
  runningTaskCount: number;
  warnings: string[];
  tasks: AgentTeamTaskState[];
  summaries: AgentTeamSummaryState[];
}

type AgentTeamEvent =
  | SDKTaskStartedMessage
  | SDKTaskProgressMessage
  | SDKTaskNotificationMessage
  | SDKPostTurnSummaryMessage;

function clampWorkerBudget(raw: number): number {
  if (!Number.isFinite(raw)) {
    return 3;
  }
  return Math.min(8, Math.max(1, Math.round(raw)));
}

function normalizeDescription(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isWriteHeavyTask(description: string, taskType?: string): boolean {
  const normalized = `${taskType ?? ''} ${description}`.toLowerCase();
  return ['implement', 'edit', 'write', 'refactor', 'fix', 'patch', 'modify'].some((keyword) =>
    normalized.includes(keyword),
  );
}

function deriveProgressNote(summary?: string, lastToolName?: string): string | undefined {
  if (summary?.trim()) {
    return summary.trim();
  }
  if (!lastToolName) {
    return undefined;
  }

  const normalized = lastToolName.toLowerCase();
  if (normalized.includes('read')) return 'Reading relevant files';
  if (normalized.includes('grep') || normalized.includes('search')) return 'Searching the workspace';
  if (normalized.includes('glob')) return 'Mapping matching files';
  if (normalized.includes('bash') || normalized.includes('command')) return 'Running a shell check';
  if (normalized.includes('edit') || normalized.includes('write')) return 'Applying file changes';
  if (normalized.includes('agent')) return 'Coordinating worker tasks';
  return `Using ${lastToolName}`;
}

function recomputeTaskWarnings(state: AgentTeamBoardState): AgentTeamBoardState {
  const runningTasks = state.tasks.filter((task) => task.status === 'running');
  const normalizedDescriptions = new Map<string, number>();

  for (const task of runningTasks) {
    const normalized = normalizeDescription(task.description);
    normalizedDescriptions.set(normalized, (normalizedDescriptions.get(normalized) ?? 0) + 1);
  }

  const tasks = state.tasks.map((task) => ({
    ...task,
    duplicateDescription:
      task.status === 'running' &&
      (normalizedDescriptions.get(normalizeDescription(task.description)) ?? 0) > 1,
  }));

  const warnings: string[] = [];
  if (runningTasks.length > state.maxWorkers) {
    warnings.push(`Delegation budget exceeded: ${runningTasks.length} active workers for a ${state.maxWorkers}-worker budget.`);
  }

  const duplicateCount = tasks.filter((task) => task.duplicateDescription).length;
  if (duplicateCount > 0) {
    warnings.push('Possible duplicate delegation detected across active worker tasks.');
  }

  const writeHeavyRunning = tasks.filter((task) => task.status === 'running' && task.writeHeavy);
  if (writeHeavyRunning.length > 1) {
    warnings.push(
      state.useWorktrees && state.worktreeAvailable
        ? 'Multiple write-heavy workers are active. Prefer isolating overlapping edits in separate worktrees.'
        : 'Multiple write-heavy workers are active. This can cause conflicting edits without worktree isolation.',
    );
  }

  return {
    ...state,
    tasks: tasks.sort((left, right) => {
      if (left.status === right.status) return left.id.localeCompare(right.id);
      if (left.status === 'running') return -1;
      if (right.status === 'running') return 1;
      return left.id.localeCompare(right.id);
    }),
    runningTaskCount: runningTasks.length,
    warnings,
  };
}

export function normalizeAgentTeamMode(raw: string | undefined): AgentTeamMode {
  if (raw === 'assist' || raw === 'coordinate') {
    return raw;
  }
  return 'off';
}

export function createAgentTeamBoardState(
  settings: AgentTeamSettings,
  context: AgentTeamContext,
): AgentTeamBoardState {
  return recomputeTaskWarnings({
    enabled: settings.mode !== 'off',
    mode: settings.mode,
    maxWorkers: clampWorkerBudget(settings.maxWorkers),
    useWorktrees: settings.useWorktrees,
    worktreeAvailable: context.worktreeAvailable,
    currentWorktreeName: context.currentWorktreeName ?? null,
    runningTaskCount: 0,
    warnings: [],
    tasks: [],
    summaries: [],
  });
}

export function updateAgentTeamBoardContext(
  state: AgentTeamBoardState,
  settings: AgentTeamSettings,
  context: AgentTeamContext,
): AgentTeamBoardState {
  return recomputeTaskWarnings({
    ...state,
    enabled: settings.mode !== 'off',
    mode: settings.mode,
    maxWorkers: clampWorkerBudget(settings.maxWorkers),
    useWorktrees: settings.useWorktrees,
    worktreeAvailable: context.worktreeAvailable,
    currentWorktreeName: context.currentWorktreeName ?? null,
  });
}

export function applyAgentTeamEvent(
  state: AgentTeamBoardState,
  event: AgentTeamEvent,
): AgentTeamBoardState {
  if (event.subtype === 'task_started') {
    const nextTasks = state.tasks.filter((task) => task.id !== event.task_id);
    nextTasks.push({
      id: event.task_id,
      description: event.description,
      status: 'running',
      taskType: event.task_type,
      workflowName: event.workflow_name,
      prompt: event.prompt,
      toolUses: 0,
      tokenCount: 0,
      durationMs: 0,
      progressNote: 'Worker started',
      writeHeavy: isWriteHeavyTask(event.description, event.task_type),
    });
    return recomputeTaskWarnings({
      ...state,
      tasks: nextTasks,
    });
  }

  if (event.subtype === 'task_progress') {
    return recomputeTaskWarnings({
      ...state,
      tasks: state.tasks.map((task) =>
        task.id === event.task_id
          ? {
              ...task,
              description: event.description || task.description,
              toolUses: event.usage.tool_uses,
              tokenCount: event.usage.total_tokens,
              durationMs: event.usage.duration_ms,
              lastToolName: event.last_tool_name,
              summary: event.summary,
              progressNote: deriveProgressNote(event.summary, event.last_tool_name),
            }
          : task,
      ),
    });
  }

  if (event.subtype === 'task_notification') {
    return recomputeTaskWarnings({
      ...state,
      tasks: state.tasks.map((task) =>
        task.id === event.task_id
          ? {
              ...task,
              status: event.status === 'stopped' ? 'stopped' : event.status,
              summary: event.summary,
              progressNote: deriveProgressNote(event.summary, task.lastToolName),
              toolUses: event.usage?.tool_uses ?? task.toolUses,
              tokenCount: event.usage?.total_tokens ?? task.tokenCount,
              durationMs: event.usage?.duration_ms ?? task.durationMs,
            }
          : task,
      ),
    });
  }

  const nextSummaries = state.summaries.filter((summary) => summary.id !== event.summarizes_uuid);
  nextSummaries.unshift({
    id: event.summarizes_uuid,
    title: event.title,
    statusCategory: event.status_category,
    description: event.description,
    recentAction: event.recent_action,
    needsAction: event.needs_action,
  });

  return {
    ...state,
    summaries: nextSummaries.slice(0, 8),
  };
}

export function resetAgentTeamBoardState(state: AgentTeamBoardState): AgentTeamBoardState {
  return {
    ...state,
    runningTaskCount: 0,
    warnings: [],
    tasks: [],
    summaries: [],
  };
}

export function settleRunningAgentTeamTasks(
  state: AgentTeamBoardState,
  options?: {
    status?: 'completed' | 'failed' | 'stopped';
    summary?: string;
  },
): AgentTeamBoardState {
  const status = options?.status ?? 'stopped';
  const summary =
    options?.summary ??
    (status === 'completed'
      ? 'Worker completed.'
      : status === 'failed'
        ? 'Worker ended with an error before reporting completion.'
        : 'Worker stopped before a completion event was received.');

  return recomputeTaskWarnings({
    ...state,
    tasks: state.tasks.map((task) =>
      task.status === 'running'
        ? {
            ...task,
            status,
            summary: task.summary || summary,
          }
        : task,
    ),
  });
}

export function buildAgentTeamEnv(settings: AgentTeamSettings): Record<string, string> {
  if (settings.mode === 'off') {
    return {};
  }

  return {
    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
    ...(settings.mode === 'coordinate' ? { CLAUDE_CODE_COORDINATOR_MODE: '1' } : {}),
  };
}

export function buildAgentTeamPrompt(
  settings: AgentTeamSettings,
  context: AgentTeamContext,
): string {
  if (settings.mode === 'off') {
    return '';
  }

  const lines = [
    '## VS Code Multi-Agent Execution Policy',
    `- Agent-team mode is active in "${settings.mode}" mode.`,
    `- Hard delegation budget: launch at most ${clampWorkerBudget(settings.maxWorkers)} concurrent worker tasks unless an existing worker finishes first.`,
    '- Do not delegate trivial single-step work that can be completed directly.',
    '- Avoid duplicate worker prompts covering the same investigation or file set.',
    '- Parent agent must synthesize worker findings before launching implementation or verification follow-up work.',
    '- While work is in progress, emit concise milestone summaries so the UI can show live updates. Good examples: "Mapped old/new folders", "Found audit manager", "Comparing write path", "Running verifier", "Preparing final summary".',
    '- On completion, provide a structured final summary with: Checked, Findings, Changes or No changes, Remaining risk, and Next action.',
  ];

  if (settings.useWorktrees && context.worktreeAvailable) {
    lines.push(
      context.currentWorktreeName
        ? `- Current workspace is already in worktree "${context.currentWorktreeName}". Use additional worktrees for parallel write-heavy work when file overlap is likely.`
        : '- Git worktrees are available here. Prefer worktree isolation for parallel write-heavy worker tasks.',
    );
  } else {
    lines.push('- Worktree isolation is unavailable here, so do not run overlapping write-heavy workers in parallel.');
  }

  return lines.join('\n');
}
