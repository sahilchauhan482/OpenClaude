import { useState, useCallback, useEffect, useRef } from 'react';
import { vscode } from '../vscode';
import { useStream } from './useStream';
import type {
  AgentTaskProgress,
  AgentTeamBoardState,
  ChatMessage,
  FileEditMessageState,
  SessionCost,
  SystemInlineMessageState,
  WorkPlanItemState,
  WorkPlanState,
} from '../types/chat';
import type { AttachmentItem } from '../types/attachments';
import { describeUserMessageContent } from '../utils/messageContent';
import { getProviderStateModel } from '../utils/providerState';
import { resolveModelSupportsImages } from '../utils/modelCapabilities';
import { formatToolDelta, getToolPresentation } from '../utils/toolPresentation';
import { deriveProgressNote } from '../utils/agentProgress';
import {
  sanitizeAssistantContentBlocks,
  sanitizeAssistantRenderableBlocks,
} from '../utils/transcriptFilters';
import type {
  SDKMessage,
  StreamEvent,
  AssistantMessage,
  UserMessage,
  ResultMessage,
  SystemInitMessage,
} from '../types/messages';

const EMPTY_COST: SessionCost = {
  totalCostUSD: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  numTurns: 0,
  durationMs: 0,
};

export interface RateLimitInfo {
  resetsAt: number;       // Unix timestamp seconds
  rateLimitType: string;
  message: string;
}

export interface ToolActivity {
  toolName: string;
  description: string;  // e.g. "Editing src/App.tsx" or "Running: npm test"
}

export type { WorkPlanState };

interface AvailableModel {
  value: string;
  displayName: string;
  id?: string;
  apiName?: string;
  name?: string;
  description?: string;
  modalities?: string[];
  classification?: string[];
  supportsImageInput?: boolean;
  supportsVision?: boolean;
  supportsImages?: boolean;
  capabilities?: {
    supportsImages?: boolean;
    supportsImageInput?: boolean;
    supportsVision?: boolean;
  };
}

interface ApiRetryMessage {
  type: 'system';
  subtype: 'api_retry';
  attempt?: number;
  max_attempts?: number;
  delay_ms?: number;
  reason?: string;
}

type SystemTimelineEntry = NonNullable<SystemInlineMessageState['timeline']>[number];

function appendSystemTimelineEntry(
  existing: SystemInlineMessageState | undefined,
  entry: SystemTimelineEntry,
): SystemTimelineEntry[] {
  const timeline = [...(existing?.timeline ?? [])];
  const lastEntry = timeline[timeline.length - 1];

  if (
    lastEntry &&
    lastEntry.label === entry.label &&
    (lastEntry.detail ?? '') === (entry.detail ?? '') &&
    lastEntry.tone === entry.tone
  ) {
    timeline[timeline.length - 1] = entry;
    return timeline;
  }

  timeline.push(entry);
  return timeline.slice(-12);
}

function createSystemTimelineEntry(
  label: string,
  detail?: string,
  tone: NonNullable<SystemTimelineEntry['tone']> = 'info',
): SystemTimelineEntry {
  const timestamp = Date.now();
  return {
    id: `${label}-${timestamp}`,
    label,
    detail,
    timestamp,
    tone,
  };
}

function formatElapsedSeconds(durationMs?: number): string | null {
  if (typeof durationMs !== 'number' || durationMs <= 0) {
    return null;
  }
  return `${Math.max(1, Math.round(durationMs / 1000))}s`;
}

function buildWorkerCardDetail(params: {
  summary?: string;
  lastTool?: string;
  toolUses?: number;
  tokenCount?: number;
  durationMs?: number;
  fallback?: string;
}): string | undefined {
  const lines: string[] = [];

  if (params.summary?.trim()) {
    lines.push(params.summary.trim());
  }

  const statParts: string[] = [];
  if (params.lastTool?.trim()) statParts.push(`Last tool: ${params.lastTool.trim()}`);
  if (typeof params.toolUses === 'number' && params.toolUses > 0) {
    statParts.push(`${params.toolUses} operation${params.toolUses !== 1 ? 's' : ''}`);
  }
  if (typeof params.tokenCount === 'number' && params.tokenCount > 0) {
    statParts.push(`${params.tokenCount} tokens`);
  }
  const elapsed = formatElapsedSeconds(params.durationMs);
  if (elapsed) statParts.push(elapsed);
  if (statParts.length > 0) lines.push(statParts.join(' · '));

  if (lines.length === 0 && params.fallback?.trim()) {
    lines.push(params.fallback.trim());
  }

  return lines.length > 0 ? lines.join('\n') : undefined;
}

function buildWorkerCardMeta(params: {
  lastTool?: string;
  toolUses?: number;
  tokenCount?: number;
  durationMs?: number;
}): NonNullable<SystemInlineMessageState['meta']> {
  const meta: NonNullable<SystemInlineMessageState['meta']> = [];

  if (params.lastTool?.trim()) {
    meta.push({ label: 'Last tool', value: params.lastTool.trim() });
  }
  if (typeof params.toolUses === 'number' && params.toolUses > 0) {
    meta.push({ label: 'Operations', value: String(params.toolUses) });
  }
  if (typeof params.tokenCount === 'number' && params.tokenCount > 0) {
    meta.push({ label: 'Tokens', value: String(params.tokenCount) });
  }
  const elapsed = formatElapsedSeconds(params.durationMs);
  if (elapsed) {
    meta.push({ label: 'Elapsed', value: elapsed });
  }

  return meta;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function getMessageRecord(message: SDKMessage): Record<string, unknown> | null {
  return isRecord(message) ? message : null;
}

function isApiRetryMessage(message: SDKMessage): message is ApiRetryMessage {
  return message.type === 'system' && message.subtype === 'api_retry';
}

function getAttachmentPreview(text: string, attachments: AttachmentItem[]): string {
  const parts: string[] = [];
  const trimmed = text.trim();
  if (trimmed) parts.push(trimmed);

  const nonImageAttachments = attachments.filter((attachment) => attachment.type !== 'image');
  const imageAttachments = attachments.filter((attachment) => attachment.type === 'image');
  if (!trimmed) {
    if (nonImageAttachments.length > 0) {
      const lines: string[] = [''];
      lines.push('Attached content:');
      for (const attachment of nonImageAttachments) {
        lines.push(`- ${attachment.name}`);
      }
      parts.push(lines.join('\n'));
    }

    if (imageAttachments.length > 0) {
      parts.push(imageAttachments.length === 1 ? '[image attached]' : `[${imageAttachments.length} images attached]`);
    }
  }

  return parts.join('\n\n') || '[message]';
}

/** Format a human-readable description of tool activity */
function formatToolActivity(
  toolName: string,
  progress?: string,
  input?: Record<string, unknown>,
): string {
  if (progress) return progress;

  const presentation = getToolPresentation(toolName, input ?? {});
  const delta = formatToolDelta(presentation.delta);

  if (presentation.kind === 'command') {
    return presentation.summary || 'Running command...';
  }

  if (presentation.kind === 'file') {
    return delta ? `${presentation.summary} ${delta}` : presentation.summary;
  }

  if (presentation.kind === 'search' || presentation.kind === 'web') {
    return presentation.summary;
  }

  return `${toolName}...`;
}

function formatLineDelta(additions: number, deletions: number): string {
  const parts: string[] = [];
  if (additions > 0) parts.push(`+${additions}`);
  if (deletions > 0) parts.push(`-${deletions}`);
  return parts.join(' ');
}

function formatFileEditProgress(fileName: string, additions: number, deletions: number): string {
  const delta = formatLineDelta(additions, deletions);
  return delta ? `${fileName} ${delta}` : fileName;
}

function normalizePlanStatus(value: unknown): WorkPlanItemState['status'] {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'completed' || normalized === 'done' || normalized === 'complete') {
    return 'completed';
  }
  if (normalized === 'in_progress' || normalized === 'in-progress' || normalized === 'running' || normalized === 'active') {
    return 'in_progress';
  }
  return 'pending';
}

function parsePlanFromToolInput(toolName: string, input?: Record<string, unknown>): WorkPlanState | null {
  if (!input) {
    return null;
  }

  const normalizedName = toolName.toLowerCase();
  if (!normalizedName.includes('todowrite') && !normalizedName.includes('updateplan')) {
    return null;
  }

  const rawItems = Array.isArray(input.todos)
    ? input.todos
    : Array.isArray(input.plan)
      ? input.plan
      : [];

  const items = rawItems.flatMap((item, index): WorkPlanItemState[] => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const record = item as Record<string, unknown>;
    const text =
      typeof record.content === 'string' ? record.content
      : typeof record.step === 'string' ? record.step
      : typeof record.title === 'string' ? record.title
      : '';

    if (!text.trim()) {
      return [];
    }

    return [{
      id: typeof record.id === 'string' ? record.id : `plan-${index}`,
      text: text.trim(),
      status: normalizePlanStatus(record.status),
    }];
  });

  return items.length > 0
    ? { items, source: 'tool', updatedAt: Date.now() }
    : null;
}

function parsePlanFromText(text: string): WorkPlanState | null {
  if (!/\btasks?\s*\(/i.test(text)) {
    return null;
  }

  const lines = text.split(/\r?\n/);
  const items: WorkPlanItemState[] = [];
  for (const line of lines) {
    const match = line.match(/^\s*(?:[\u2713\u221a]\s+|[-*]\s*\[[xX]\]\s+|\u25a0\s+|\u25a1\s+|[-*]\s*\[\s\]\s+)(.+?)\s*$/);
    if (!match?.[1]) {
      continue;
    }

    const marker = line.trimStart().slice(0, 2);
    const status = marker.includes('\u2713') || marker.includes('\u221a') || /\[[xX]\]/.test(line)
      ? 'completed'
      : marker.includes('\u25a0')
        ? 'in_progress'
        : 'pending';

    items.push({
      id: `text-plan-${items.length}`,
      text: match[1].trim(),
      status,
    });
  }

  return items.length > 0
    ? { items, source: 'assistant', updatedAt: Date.now() }
    : null;
}

function parseFileEditMessage(data: Record<string, unknown>): FileEditMessageState {
  return {
    stage: (data.stage as FileEditMessageState['stage']) || 'reviewing',
    filePath: (data.filePath as string | undefined) || (data.fileName as string | undefined) || 'file',
    fileName: (data.fileName as string | undefined) || 'file',
    toolName: (data.toolName as string | undefined) || 'FileEditTool',
    additions: typeof data.additions === 'number' ? data.additions : 0,
    deletions: typeof data.deletions === 'number' ? data.deletions : 0,
    preview:
      data.preview && typeof data.preview === 'object'
        ? {
            contextBefore: Array.isArray((data.preview as Record<string, unknown>).contextBefore)
              ? ((data.preview as Record<string, unknown>).contextBefore as string[])
              : [],
            removed: Array.isArray((data.preview as Record<string, unknown>).removed)
              ? ((data.preview as Record<string, unknown>).removed as string[])
              : [],
            added: Array.isArray((data.preview as Record<string, unknown>).added)
              ? ((data.preview as Record<string, unknown>).added as string[])
              : [],
            contextAfter: Array.isArray((data.preview as Record<string, unknown>).contextAfter)
              ? ((data.preview as Record<string, unknown>).contextAfter as string[])
              : [],
            truncated: Boolean((data.preview as Record<string, unknown>).truncated),
          }
        : undefined,
  };
}

function parseSystemInlineMessage(text: string): SystemInlineMessageState {
  const trimmed = text.trim();
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const first = lines[0] ?? trimmed;
  const rest = lines.slice(1).join(' ');
  const normalized = trimmed.toLowerCase();

  if (normalized.includes('retrying once with an alternate strategy')) {
    return {
      tone: 'warning',
      label: 'Recovery',
      title: 'Agent adapted strategy',
      detail: 'Repeated tool failures were detected, so OpenClaude is retrying once with a different recovery path instead of stopping.',
    };
  }

  if (normalized.startsWith('provider ') && normalized.includes('rate-limited')) {
    return {
      tone: 'warning',
      label: 'Fallback',
      title: 'Provider fallback',
      detail: trimmed,
    };
  }

  if (normalized.includes('compacted')) {
    return {
      tone: 'info',
      label: 'Context',
      title: 'Context compacted',
      detail: trimmed,
    };
  }

  if (normalized.includes('retrying api call')) {
    return {
      tone: 'info',
      label: 'Retry',
      title: 'Retrying request',
      detail: trimmed,
    };
  }

  return {
    tone: normalized.includes('warning') ? 'warning' : 'info',
    label: normalized.includes('warning') ? 'Warning' : 'Update',
    title: first,
    detail: rest || undefined,
  };
}

function formatApiRetryMessage(msg: ApiRetryMessage): SystemInlineMessageState {
  const attempt = typeof msg.attempt === 'number' ? msg.attempt : undefined;
  const maxAttempts = typeof msg.max_attempts === 'number' ? msg.max_attempts : undefined;
  const delayMs = typeof msg.delay_ms === 'number' ? msg.delay_ms : undefined;
  const reason = typeof msg.reason === 'string' && msg.reason.trim() ? msg.reason.trim() : undefined;

  const detailParts: string[] = [];
  if (attempt !== undefined && maxAttempts !== undefined) {
    detailParts.push(`Attempt ${attempt} of ${maxAttempts}.`);
  } else if (attempt !== undefined) {
    detailParts.push(`Retry attempt ${attempt}.`);
  } else {
    detailParts.push('The provider request is being retried automatically.');
  }

  if (delayMs !== undefined && delayMs > 0) {
    detailParts.push(`Waiting ${Math.ceil(delayMs / 1000)}s before the next try.`);
  }

  if (reason) {
    detailParts.push(reason);
  }

  return {
    tone: 'info',
    label: 'Retry',
    title: 'Retrying request',
    detail: detailParts.join(' '),
    collapsible: true,
    meta: [
      ...(attempt !== undefined ? [{ label: 'Attempt', value: maxAttempts !== undefined ? `${attempt}/${maxAttempts}` : String(attempt) }] : []),
      ...(delayMs !== undefined && delayMs > 0 ? [{ label: 'Delay', value: `${Math.ceil(delayMs / 1000)}s` }] : []),
    ],
    timeline: [
      createSystemTimelineEntry(
        attempt !== undefined ? `Retry attempt ${attempt}` : 'Retry scheduled',
        detailParts.join(' '),
        'info',
      ),
    ],
  };
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cost, setCost] = useState<SessionCost>(EMPTY_COST);
  const [isStreaming, setIsStreaming] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null);
  const [promptSuggestions, setPromptSuggestions] = useState<string[]>([]);
  const [processState, setProcessState] = useState<'idle' | 'starting' | 'running' | 'stopped' | 'crashed'>('idle');
  const [fastModeState, setFastModeState] = useState<{ enabled: boolean; canToggle: boolean }>({
    enabled: false,
    canToggle: true,
  });
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [effortLevel, setEffortLevel] = useState<string>('medium');
  const [toolActivity, setToolActivity] = useState<ToolActivity | null>(null);
  const [attachmentProcessing, setAttachmentProcessing] = useState<string | null>(null);
  const [activeFileEdit, setActiveFileEdit] = useState<FileEditMessageState | null>(null);
  const [workPlan, setWorkPlan] = useState<WorkPlanState | null>(null);
  const [agentTeamBoard, setAgentTeamBoard] = useState<AgentTeamBoardState | null>(null);
  const [agentTaskProgress, setAgentTaskProgress] = useState<Record<string, AgentTaskProgress>>({});

  const { processStreamEvent, resetStream } = useStream();
  const streamingUuidRef = useRef<string | null>(null);

  const handleUserMessage = useCallback((msg: UserMessage) => {
    const id = msg.uuid || `user-${Date.now()}`;
    const text = describeUserMessageContent(msg.message.content as string | Array<Record<string, unknown>>);
    if (!text.trim()) {
      return;
    }

    const chatMsg: ChatMessage = {
      id,
      role: 'user',
      text,
      isStreaming: false,
      timestamp: Date.now(),
      parentToolUseId: null,
    };
    setMessages((prev) => {
      // Skip if this message was already loaded from session history
      if (msg.uuid && prev.some((m) => m.id === msg.uuid)) return prev;
      return [...prev, chatMsg];
    });
  }, []);

  const handleStreamEvent = useCallback(
    (streamEvent: StreamEvent) => {
      const update = processStreamEvent(streamEvent);

      switch (update.type) {
        case 'message_start': {
          streamingUuidRef.current = update.uuid;
          setIsStreaming(true);
          setAttachmentProcessing(null);
          setToolActivity(null);
          setActiveFileEdit(null);
          if (update.model) setModel(update.model);

          const chatMsg: ChatMessage = {
            id: update.uuid,
            role: 'assistant',
            blocks: [],
            isStreaming: true,
            timestamp: Date.now(),
            parentToolUseId: update.parentToolUseId,
            model: update.model || undefined,
          };
          setMessages((prev) => [...prev, chatMsg]);
          break;
        }

        case 'block_start':
        case 'block_delta':
        case 'block_stop': {
          const uuid = streamingUuidRef.current;
          if (!uuid) break;
          const sanitizedBlocks = sanitizeAssistantRenderableBlocks(update.blocks ?? []);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === uuid ? { ...msg, blocks: sanitizedBlocks } : msg,
            ),
          );
          // Extract tool activity from tool_use blocks
          if ((update.type === 'block_start' || update.type === 'block_delta' || update.type === 'block_stop') && update.blocks) {
            const latestBlock = update.blocks[update.blocks.length - 1];
            if (latestBlock) {
              const block = latestBlock.block;
              if (block.type === 'tool_use' || block.type === 'server_tool_use') {
                const toolInput = (block as { input?: Record<string, unknown> }).input;
                setToolActivity({
                  toolName: block.name,
                  description: formatToolActivity(block.name, undefined, toolInput),
                });
                const parsedPlan = parsePlanFromToolInput(block.name, toolInput);
                if (parsedPlan) {
                  setWorkPlan(parsedPlan);
                }
              }
            }
          }
          break;
        }

        case 'message_stop': {
          const uuid = streamingUuidRef.current;
          if (uuid) {
            setMessages((prev) =>
              prev.flatMap((msg) => {
                if (msg.id !== uuid) {
                  return [msg];
                }

                const finalizedBlocks = msg.blocks?.map((b) => ({ ...b, isStreaming: false })) ?? [];
                if (finalizedBlocks.length === 0) {
                  return [];
                }

                return [{
                  ...msg,
                  isStreaming: false,
                  blocks: finalizedBlocks,
                }];
              }),
            );
          }
          setIsStreaming(false);
          setToolActivity(null);
          setActiveFileEdit(null);
          streamingUuidRef.current = null;
          resetStream();
          break;
        }
      }
    },
    [processStreamEvent, resetStream],
  );

  const handleAssistantMessage = useCallback((msg: AssistantMessage) => {
    const blocks = sanitizeAssistantContentBlocks(msg.message.content || []).map((block, index) => ({
      index,
      block,
      isStreaming: false,
    }));

    if (blocks.length === 0) {
      return;
    }

    const chatMsg: ChatMessage = {
      id: msg.uuid,
      role: 'assistant',
      blocks,
      isStreaming: false,
      timestamp: Date.now(),
      parentToolUseId: msg.parent_tool_use_id,
      model: msg.message.model,
    };
    setMessages((prev) => {
      // Skip if this message was already loaded from session history
      if (msg.uuid && prev.some((m) => m.id === msg.uuid)) return prev;
      return [...prev, chatMsg];
    });

    for (const block of msg.message.content || []) {
      if (block.type !== 'text') {
        continue;
      }
      const parsedPlan = parsePlanFromText(block.text);
      if (parsedPlan) {
        setWorkPlan(parsedPlan);
      }
    }
  }, []);

  const handleResultMessage = useCallback((msg: ResultMessage) => {
    setIsStreaming(false);
    setToolActivity(null);
    setActiveFileEdit(null);
    streamingUuidRef.current = null;
    resetStream();

    setCost({
      totalCostUSD: msg.total_cost_usd,
      inputTokens: msg.usage?.inputTokens ?? 0,
      outputTokens: msg.usage?.outputTokens ?? 0,
      cacheReadTokens: msg.usage?.cacheReadInputTokens ?? 0,
      cacheCreationTokens: msg.usage?.cacheCreationInputTokens ?? 0,
      numTurns: msg.num_turns,
      durationMs: msg.duration_ms,
    });

    if (msg.is_error) {
      // Parse rate limit from result text e.g. "You've hit your limit · resets 3am (America/New_York)"
      const resultText = typeof msg.result === 'string' ? msg.result : undefined;
      if (resultText) {
        setError(resultText);
      } else if (msg.errors && msg.errors.length > 0) {
        setError(msg.errors.join('\n'));
      } else {
        setError('An error occurred');
      }
    }
    setAttachmentProcessing(null);
  }, [resetStream]);

  const handleSystemInit = useCallback((msg: SystemInitMessage) => {
    setSessionId(msg.session_id);
    setModel(msg.model);
  }, []);

  const handleSessionTitle = useCallback((title: string) => {
    setSessionTitle(title);
  }, []);

  // Add a system-style inline message to the chat
  const addSystemMessage = useCallback((text: string, id?: string, system?: SystemInlineMessageState) => {
    setMessages((prev) => [
      ...prev,
      {
        id: id ?? `sys-${Date.now()}`,
        role: 'system' as const,
        text,
        system,
        isStreaming: false,
        timestamp: Date.now(),
        parentToolUseId: null,
      },
    ]);
  }, []);

  const upsertSystemMessage = useCallback((
    id: string,
    text: string,
    system?: SystemInlineMessageState | ((previous?: SystemInlineMessageState) => SystemInlineMessageState | undefined),
  ) => {
    setMessages((prev) => {
      const existingIdx = prev.findIndex((message) => message.id === id);
      const previousSystem = existingIdx >= 0 ? prev[existingIdx]?.system : undefined;
      const resolvedSystem = typeof system === 'function' ? system(previousSystem) : system;
      const nextMessage: ChatMessage = {
        id,
        role: 'system',
        text,
        system: resolvedSystem,
        isStreaming: false,
        timestamp: Date.now(),
        parentToolUseId: null,
      };

      if (existingIdx >= 0) {
        return prev.map((message, index) => (index === existingIdx ? nextMessage : message));
      }

      return [...prev, nextMessage];
    });
  }, []);

  const addFileEditMessage = useCallback((fileEdit: FileEditMessageState, id?: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: id ?? `file-edit-${Date.now()}`,
        role: 'system' as const,
        fileEdit,
        isStreaming: false,
        timestamp: Date.now(),
        parentToolUseId: null,
      },
    ]);
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      // Handle process state changes
      if (data.type === 'process_state') {
        setProcessState(data.state);
        if (data.state === 'stopped' || data.state === 'crashed') {
          setIsStreaming(false);
          setAttachmentProcessing(null);
          setToolActivity(null);
          setAttachmentProcessing(null);
          setActiveFileEdit(null);
          streamingUuidRef.current = null;
        }
        // Clear errors when process comes back up
        if (data.state === 'running' || data.state === 'starting') {
          setError(null);
          setRateLimitInfo(null);
        }
        return;
      }

      if (data.type === 'provider_state') {
        const providerModel = getProviderStateModel(data as { currentModel?: unknown });
        if (providerModel) {
          setModel(providerModel);
        }
        return;
      }

      if (data.type === 'attachment_processing') {
        const status = data.status as string | undefined;
        if (status === 'start') {
          setAttachmentProcessing((data.message as string | undefined) || 'Preparing attachment(s)...');
        } else if (status === 'done') {
          setAttachmentProcessing(null);
        }
        return;
      }

      if (data.type === 'file_edit_status') {
        const fileEdit = parseFileEditMessage(data as Record<string, unknown>);

        if (fileEdit.stage === 'reviewing') {
          setActiveFileEdit(fileEdit);
          vscode.postMessage({ type: 'open_file', filePath: fileEdit.filePath });
          setToolActivity({
            toolName: 'Editing',
            description: formatFileEditProgress(
              fileEdit.fileName,
              fileEdit.additions,
              fileEdit.deletions,
            ),
          });
        } else if (fileEdit.stage === 'applied') {
          setActiveFileEdit(null);
          addFileEditMessage(fileEdit, `file-edit-${Date.now()}`);
          setToolActivity((prev) => (prev?.toolName === 'Editing' ? null : prev));
        } else if (fileEdit.stage === 'rejected') {
          setActiveFileEdit(null);
          addFileEditMessage(fileEdit, `file-edit-${Date.now()}`);
          setToolActivity((prev) => (prev?.toolName === 'Editing' ? null : prev));
        }
        return;
      }

      if (data.type === 'agent_team_board') {
        setAgentTeamBoard((data.board as AgentTeamBoardState | null) ?? null);
        return;
      }

      // Unwrap cli_output envelope
      const msg: SDKMessage = data.type === 'cli_output' ? data.data : data;
      if (!msg || typeof msg !== 'object') return;

      try {
        const msgAny = getMessageRecord(msg);
        if (!msgAny) {
          return;
        }

        switch (msgAny.type) {
          case 'stream_event':
            handleStreamEvent(msg as StreamEvent);
            break;

          case 'user':
            handleUserMessage(msg as UserMessage);
            break;

          case 'assistant':
            handleAssistantMessage(msg as AssistantMessage);
            break;

          case 'result':
            handleResultMessage(msg as ResultMessage);
            {
              const resultAny = getMessageRecord(msg);
              if (!resultAny) {
                break;
              }
              if (resultAny.fast_mode_state) {
                const fms = resultAny.fast_mode_state as Record<string, unknown>;
                setFastModeState({
                  enabled: (fms.enabled as boolean) ?? false,
                  canToggle: (fms.canToggle as boolean) ?? true,
                });
              }
              if (typeof resultAny.effort === 'string') {
                setEffortLevel(resultAny.effort);
              }
            }
            break;

          case 'rate_limit_event': {
            const info = msgAny.rate_limit_info as Record<string, unknown> | undefined;
            if (info) {
              const resetsAt = info.resetsAt as number;
              const rateLimitType = info.rateLimitType as string ?? 'unknown';
              const resetTime = resetsAt
                ? new Date(resetsAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'soon';
              setRateLimitInfo({
                resetsAt,
                rateLimitType,
                message: `Rate limited (${rateLimitType}). Resets at ${resetTime}.`,
              });
              // Don't also setError — ErrorBanner shows rateLimitInfo directly
            }
            break;
          }

          case 'tool_progress': {
            const toolName = msgAny.tool_name as string ?? 'tool';
            const elapsed = typeof msgAny.elapsed_time_seconds === 'number' ? msgAny.elapsed_time_seconds : 0;
            const description = elapsed > 2
              ? `${formatToolActivity(toolName, undefined, undefined)} (${Math.round(elapsed)}s)`
              : formatToolActivity(toolName, undefined, undefined);
            setToolActivity({ toolName, description });
            // For long-running tools (>5s), show an inline progress message
            if (elapsed > 5) {
              const progressId = `tool-progress-${String(msgAny.tool_use_id ?? 'active')}`;
              upsertSystemMessage(progressId, description, {
                tone: 'info',
                label: 'Tool',
                title: `Running ${toolName}`,
                detail: `Active for ${Math.round(elapsed)}s.`,
              });
            }
            break;
          }

          case 'tool_use_summary': {
            const toolName = msgAny.tool_name as string ?? 'tool';
            const summary = msgAny.summary as string ?? '';
            const progressId = `tool-progress-${String(msgAny.tool_use_id ?? Date.now())}`;
            if (summary) {
              upsertSystemMessage(progressId, `${toolName}: ${summary}`, {
                tone: 'success',
                label: 'Tool',
                title: `${toolName} finished`,
                detail: summary,
              });
            }
            // Clear tool activity after summary
            setToolActivity(null);
            break;
          }

          case 'prompt_suggestion': {
            const suggestions = (msgAny.suggestions as string[]) ??
              [msgAny.suggestion as string].filter(Boolean);
            if (suggestions.length > 0) {
              setPromptSuggestions(suggestions);
            }
            break;
          }

          case 'system': {
            const subtype = msgAny.subtype as string;
            switch (subtype) {
              case 'init':
                handleSystemInit(msg as SystemInitMessage);
                {
                  const initAny = getMessageRecord(msg);
                  if (!initAny) {
                    break;
                  }
                  if (initAny.fast_mode_state) {
                    const fms = initAny.fast_mode_state as Record<string, unknown>;
                    setFastModeState({
                      enabled: (fms.enabled as boolean) ?? false,
                      canToggle: (fms.canToggle as boolean) ?? true,
                    });
                  }
                  if (Array.isArray(initAny.models)) {
                  setAvailableModels(
                      (initAny.models as Array<Record<string, unknown>>)
                        .map((m) => ({
                          value: (m.value as string) || (m.id as string) || '',
                          displayName: (m.displayName as string) || (m.name as string) || (m.value as string) || '',
                          id: (m.id as string) || undefined,
                          apiName: (m.apiName as string) || undefined,
                          name: (m.name as string) || undefined,
                          description: (m.description as string) || undefined,
                          modalities: Array.isArray(m.modalities) ? (m.modalities as string[]) : undefined,
                          classification: Array.isArray(m.classification) ? (m.classification as string[]) : undefined,
                          supportsImageInput: m.supportsImageInput as boolean | undefined,
                          supportsVision: m.supportsVision as boolean | undefined,
                          capabilities:
                            m.capabilities && typeof m.capabilities === 'object'
                              ? {
                                  supportsImages: (m.capabilities as Record<string, unknown>).supportsImages as boolean | undefined,
                                  supportsImageInput: (m.capabilities as Record<string, unknown>).supportsImageInput as boolean | undefined,
                                  supportsVision: (m.capabilities as Record<string, unknown>).supportsVision as boolean | undefined,
                                }
                              : undefined,
                          supportsImages: resolveModelSupportsImages({
                            value: (m.value as string) || (m.id as string) || '',
                            displayName: (m.displayName as string) || (m.name as string) || (m.value as string) || '',
                            id: (m.id as string) || undefined,
                            apiName: (m.apiName as string) || undefined,
                            name: (m.name as string) || undefined,
                            description: (m.description as string) || undefined,
                            modalities: Array.isArray(m.modalities) ? (m.modalities as string[]) : undefined,
                            classification: Array.isArray(m.classification) ? (m.classification as string[]) : undefined,
                            supportsImages: m.supportsImages as boolean | undefined,
                            supportsImageInput: m.supportsImageInput as boolean | undefined,
                            supportsVision: m.supportsVision as boolean | undefined,
                            capabilities:
                              m.capabilities && typeof m.capabilities === 'object'
                                ? {
                                    supportsImages: (m.capabilities as Record<string, unknown>).supportsImages as boolean | undefined,
                                    supportsImageInput: (m.capabilities as Record<string, unknown>).supportsImageInput as boolean | undefined,
                                    supportsVision: (m.capabilities as Record<string, unknown>).supportsVision as boolean | undefined,
                                  }
                                : undefined,
                          }),
                        }))
                        .filter((m) => m.value),
                    );
                  }
                  if (typeof initAny.effort === 'string') {
                    setEffortLevel(initAny.effort);
                  }
                }
                break;
              case 'ai-title': {
                const title = msgAny.title as string;
                if (title) handleSessionTitle(title);
                break;
              }
              case 'informational': {
                const content = (msgAny.content as string) ?? '';
                if (content) {
                  addSystemMessage(
                    content,
                    `informational-${Date.now()}`,
                    parseSystemInlineMessage(content),
                  );
                }
                break;
              }
              case 'api_retry': {
                if (!isApiRetryMessage(msg)) {
                  break;
                }
                const retryId = `api-retry-${typeof msg.attempt === 'number' ? msg.attempt : Date.now()}`;
                const formatted = formatApiRetryMessage(msg);
                upsertSystemMessage(
                  retryId,
                  'Retrying provider request.',
                  (previous) => ({
                    ...(formatted ?? {}),
                    timeline: appendSystemTimelineEntry(
                      previous,
                      createSystemTimelineEntry(
                        typeof msg.attempt === 'number' ? `Retry attempt ${msg.attempt}` : 'Retry scheduled',
                        formatted.detail,
                        'info',
                      ),
                    ),
                  }),
                );
                break;
              }
              case 'compact_boundary':
                addSystemMessage(
                  'Context compacted to fit within limits.',
                  `compact-${Date.now()}`,
                  {
                    tone: 'info',
                    label: 'Context',
                    title: 'Context compacted',
                    detail: 'Older context was compressed to keep the session moving.',
                  },
                );
                break;
              case 'task_started': {
                const taskId = String(msgAny.task_id ?? Date.now());
                const toolUseId = typeof msgAny.tool_use_id === 'string' ? msgAny.tool_use_id : taskId;
                const taskDescription = typeof msgAny.description === 'string' ? msgAny.description.trim() : '';
                const taskPrompt = typeof msgAny.prompt === 'string' ? msgAny.prompt.trim() : '';
                const workflowName = typeof msgAny.workflow_name === 'string' ? msgAny.workflow_name.trim() : '';
                const taskType = typeof msgAny.task_type === 'string' ? msgAny.task_type.trim() : '';

                setAgentTaskProgress((prev) => ({
                  ...prev,
                  [toolUseId]: {
                    taskId,
                    toolUseId,
                    description: taskDescription || taskPrompt || 'Agent task',
                    status: 'running',
                    toolUses: 0,
                    tokenCount: 0,
                    durationMs: 0,
                    startTime: Date.now(),
                    progressNote: 'Starting up...',
                    events: [{ label: 'Started', detail: taskDescription, timestamp: Date.now() }],
                  },
                }));

                if (taskDescription) {
                  upsertSystemMessage(
                    `task-progress-${taskId}`,
                    `Delegated: ${taskDescription}`,
                    (previous) => ({
                      tone: 'info',
                      label: 'Worker',
                      title: taskDescription,
                      detail: buildWorkerCardDetail({
                        fallback: taskPrompt || taskDescription,
                      }),
                      collapsible: true,
                      meta: [
                        ...(workflowName ? [{ label: 'Workflow', value: workflowName }] : []),
                        ...(taskType ? [{ label: 'Type', value: taskType }] : []),
                      ],
                      timeline: appendSystemTimelineEntry(
                        previous,
                        createSystemTimelineEntry('Started', taskPrompt || taskDescription, 'info'),
                      ),
                    }),
                  );
                }
                break;
              }
              case 'task_progress': {
                const taskId = typeof msgAny.task_id === 'string' ? msgAny.task_id : `task-${Date.now()}`;
                const toolUseId = typeof msgAny.tool_use_id === 'string' ? msgAny.tool_use_id : taskId;
                const taskDescription = typeof msgAny.description === 'string' ? msgAny.description.trim() : '';
                const lastTool = typeof msgAny.last_tool_name === 'string' ? msgAny.last_tool_name : '';
                const taskSummary = typeof msgAny.summary === 'string' ? msgAny.summary.trim() : '';
                const taskUsage = msgAny.usage as Record<string, unknown> | undefined;
                const toolUses = typeof taskUsage?.tool_uses === 'number' ? taskUsage.tool_uses : 0;
                const tokenCount = typeof taskUsage?.total_tokens === 'number' ? taskUsage.total_tokens : 0;
                const durationMs = typeof taskUsage?.duration_ms === 'number' ? taskUsage.duration_ms : 0;

                const progressNote = deriveProgressNote(taskSummary, lastTool);
                setAgentTaskProgress((prev) => {
                  const existing = prev[toolUseId];
                  const events = existing?.events ? [...existing.events] : [];
                  if (progressNote && (events.length === 0 || events[events.length - 1]?.label !== progressNote)) {
                    events.push({ label: progressNote, detail: taskSummary || undefined, timestamp: Date.now() });
                    if (events.length > 12) events.splice(0, events.length - 12);
                  }
                  return {
                    ...prev,
                    [toolUseId]: {
                      taskId,
                      toolUseId,
                      description: taskDescription || existing?.description || 'Agent task',
                      status: 'running',
                      lastToolName: lastTool || existing?.lastToolName,
                      progressNote,
                      summary: taskSummary || existing?.summary,
                      toolUses,
                      tokenCount,
                      durationMs,
                      startTime: existing?.startTime ?? Date.now(),
                      events,
                    },
                  };
                });

                const progressTitle = taskSummary || taskDescription || (lastTool ? `Using ${lastTool}` : 'Working...');
                const progressId = `task-progress-${taskId}`;
                upsertSystemMessage(progressId, progressTitle, (previous) => {
                  const detail = buildWorkerCardDetail({
                    summary: taskSummary,
                    lastTool,
                    toolUses,
                    tokenCount,
                    durationMs,
                    fallback: taskDescription,
                  });
                  return {
                    tone: 'info',
                    label: 'Worker',
                    title: taskDescription || progressTitle,
                    detail,
                    collapsible: true,
                    meta: buildWorkerCardMeta({
                      lastTool,
                      toolUses,
                      tokenCount,
                      durationMs,
                    }),
                    timeline: appendSystemTimelineEntry(
                      previous,
                      createSystemTimelineEntry(
                        taskSummary || (lastTool ? `Used ${lastTool}` : 'Progress update'),
                        detail,
                        'info',
                      ),
                    ),
                  };
                });
                break;
              }
              case 'task_notification': {
                const taskId = String(msgAny.task_id ?? Date.now());
                const notifToolUseId = typeof msgAny.tool_use_id === 'string' ? msgAny.tool_use_id : taskId;
                const status = typeof msgAny.status === 'string' ? msgAny.status : 'completed';
                const summary = typeof msgAny.summary === 'string' ? msgAny.summary.trim() : '';
                const taskUsage = msgAny.usage as Record<string, unknown> | undefined;
                const toolUses = typeof taskUsage?.tool_uses === 'number' ? taskUsage.tool_uses : 0;
                const tokenCount = typeof taskUsage?.total_tokens === 'number' ? taskUsage.total_tokens : 0;
                const durationMs = typeof taskUsage?.duration_ms === 'number' ? taskUsage.duration_ms : 0;

                const normalizedStatus = status === 'failed' ? 'failed' as const
                  : status === 'stopped' ? 'stopped' as const
                  : 'completed' as const;
                setAgentTaskProgress((prev) => {
                  const existing = prev[notifToolUseId];
                  if (!existing) return prev;
                  const finalLabel = normalizedStatus === 'failed' ? 'Failed'
                    : normalizedStatus === 'stopped' ? 'Stopped'
                    : 'Completed';
                  return {
                    ...prev,
                    [notifToolUseId]: {
                      ...existing,
                      status: normalizedStatus,
                      summary: summary || existing.summary,
                      toolUses: toolUses || existing.toolUses,
                      tokenCount: tokenCount || existing.tokenCount,
                      durationMs: durationMs || existing.durationMs,
                      progressNote: summary || finalLabel,
                      events: [
                        ...existing.events,
                        { label: finalLabel, detail: summary || undefined, timestamp: Date.now() },
                      ],
                    },
                  };
                });

                const title =
                  status === 'failed'
                    ? 'Worker failed'
                    : status === 'stopped'
                      ? 'Worker stopped'
                      : 'Worker completed';
                upsertSystemMessage(`task-progress-${taskId}`, summary || title, (previous) => {
                  const tone = status === 'failed' ? 'warning' : status === 'stopped' ? 'error' : 'success';
                  const detail = buildWorkerCardDetail({
                    summary,
                    toolUses,
                    tokenCount,
                    durationMs,
                    fallback: title,
                  });
                  return {
                    tone,
                    label: 'Worker',
                    title: previous?.title || title,
                    detail,
                    collapsible: true,
                    meta: buildWorkerCardMeta({
                      toolUses,
                      tokenCount,
                      durationMs,
                    }),
                    timeline: appendSystemTimelineEntry(
                      previous,
                      createSystemTimelineEntry(title, detail, tone),
                    ),
                  };
                });
                break;
              }
              case 'post_turn_summary': {
                const summaryTitle = typeof msgAny.title === 'string' ? msgAny.title.trim() : '';
                const summaryDescription = typeof msgAny.description === 'string' ? msgAny.description.trim() : '';
                const recentAction = typeof msgAny.recent_action === 'string' ? msgAny.recent_action.trim() : '';
                const needsAction = typeof msgAny.needs_action === 'string' ? msgAny.needs_action.trim() : '';
                const statusCategory = typeof msgAny.status_category === 'string' ? msgAny.status_category : 'completed';

                if (!summaryTitle && !summaryDescription) break;

                const summaryTone: 'info' | 'warning' | 'success' =
                  statusCategory === 'failed' ? 'warning'
                  : statusCategory === 'completed' || statusCategory === 'review_ready' ? 'success'
                  : 'info';

                const summaryParts: string[] = [];
                if (summaryDescription) summaryParts.push(summaryDescription);
                if (recentAction) summaryParts.push(`Recent: ${recentAction}`);
                if (needsAction) summaryParts.push(`Next: ${needsAction}`);

                addSystemMessage(
                  summaryTitle || summaryDescription,
                  `post-summary-${String(msgAny.summarizes_uuid ?? Date.now())}`,
                  {
                    tone: summaryTone,
                    label: 'Summary',
                    title: summaryTitle || 'Agent update',
                    detail: summaryParts.join('\n') || undefined,
                  },
                );
                break;
              }
              case 'model_changed': {
                const nextModel = typeof msgAny.model === 'string' ? msgAny.model : '';
                if (nextModel) {
                  setModel(nextModel);
                }
                addSystemMessage(
                  typeof msgAny.message === 'string'
                    ? msgAny.message
                    : `Model switched to ${nextModel || 'the selected model'}. Continuing the same conversation.`,
                  `model-changed-${Date.now()}`,
                  {
                    tone: 'info',
                    label: 'Model',
                    title: 'Model switched',
                    detail: nextModel
                      ? `Continuing this thread with ${nextModel}.`
                      : 'Continuing this thread with the selected model.',
                  },
                );
                break;
              }
              // hook_started, hook_response, session_state_changed, files_persisted
              // — handled by extension host, ignore in webview
              default:
                break;
            }
            break;
          }

          default:
            break;
        }

        // Session title from extension host (legacy format)
        if (data.type === 'sessionTitle' && typeof data.title === 'string') {
          handleSessionTitle(data.title);
        }

        // Clear messages on new conversation
        if (data.type === 'clearMessages') {
          setMessages([]);
          setSessionTitle(null);
          setCost(EMPTY_COST);
          setIsStreaming(false);
          setError(null);
          setRateLimitInfo(null);
        setPromptSuggestions([]);
        setToolActivity(null);
        setAttachmentProcessing(null);
        setActiveFileEdit(null);
        setAgentTeamBoard(null);
        setWorkPlan(null);
        streamingUuidRef.current = null;
        resetStream();
      }

        // Bulk load session history on resume
        if (data.type === 'session_history' && Array.isArray(data.messages)) {
          const historyMsgs: ChatMessage[] = [];
          for (const entry of data.messages as Array<Record<string, unknown>>) {
            if (entry.type === 'user') {
              // Handle both { message: { content } } and direct content formats
              const msg = (typeof entry.message === 'object' && entry.message)
                ? entry.message as Record<string, unknown>
                : null;
              const content = msg?.content ?? entry.content;
              const text = describeUserMessageContent(
                typeof content === 'string'
                  ? content
                  : (Array.isArray(content) ? (content as Array<Record<string, unknown>>) : []),
              );
              if (!text.trim()) {
                continue;
              }
              historyMsgs.push({
                id: (entry.uuid as string) || `user-hist-${historyMsgs.length}`,
                role: 'user',
                text,
                isStreaming: false,
                timestamp: entry.timestamp ? new Date(entry.timestamp as string).getTime() : Date.now(),
                parentToolUseId: (entry.parent_tool_use_id as string) || null,
              });
            } else if (entry.type === 'assistant') {
              const msg = (typeof entry.message === 'object' && entry.message)
                ? entry.message as Record<string, unknown>
                : null;
              const rawContent = msg?.content ?? entry.content;
              const contentArr = Array.isArray(rawContent) ? rawContent as Array<Record<string, unknown>> : [];
              const blocks = sanitizeAssistantContentBlocks(
                contentArr as unknown as import('../types/messages').ContentBlock[],
              ).map((block, index) => ({
                index,
                block: block as unknown as import('../types/messages').ContentBlock,
                isStreaming: false,
              }));
              if (blocks.length === 0) {
                continue;
              }
              historyMsgs.push({
                id: (entry.uuid as string) || `asst-hist-${historyMsgs.length}`,
                role: 'assistant',
                blocks,
                isStreaming: false,
                timestamp: entry.timestamp ? new Date(entry.timestamp as string).getTime() : Date.now(),
                parentToolUseId: (entry.parent_tool_use_id as string) || null,
                model: (msg?.model as string) || undefined,
              });
            }
          }
          if (historyMsgs.length > 0) {
            setMessages(historyMsgs);
          }
        }

      } catch (err) {
        console.error('[useChat] Error processing message:', err, data);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [
    handleStreamEvent,
    handleUserMessage,
    handleAssistantMessage,
    handleResultMessage,
    handleSystemInit,
    handleSessionTitle,
    addSystemMessage,
    upsertSystemMessage,
    addFileEditMessage,
    resetStream,
  ]);

  const sendMessage = useCallback((text: string, attachments: AttachmentItem[] = []) => {
    if (!text.trim() && attachments.length === 0) return;

    const currentModelInfo = availableModels.find((m) =>
      m.value === model || m.id === model || m.apiName === model || m.name === model,
    );
    const modelSupportsImages = currentModelInfo?.supportsImages ?? resolveModelSupportsImages({
      value: currentModelInfo?.value ?? model ?? undefined,
      id: currentModelInfo?.id,
      apiName: currentModelInfo?.apiName,
      displayName: currentModelInfo?.displayName,
      name: currentModelInfo?.name,
      description: currentModelInfo?.description,
      modalities: currentModelInfo?.modalities,
      classification: currentModelInfo?.classification,
      supportsImages: currentModelInfo?.supportsImages,
      supportsImageInput: currentModelInfo?.supportsImageInput,
      supportsVision: currentModelInfo?.supportsVision,
      capabilities: currentModelInfo?.capabilities,
    });

    // Optimistically add user message
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setIsStreaming(true);
    setToolActivity(null);
    if (attachments.length > 0) {
      setAttachmentProcessing('Preparing attachment(s)...');
    }
    setMessages((prev) => [
      ...prev,
      {
        id,
        role: 'user',
        text: getAttachmentPreview(text, attachments),
        attachments: attachments.length > 0 ? attachments.map((attachment) => ({ ...attachment })) : undefined,
        isStreaming: false,
        timestamp: Date.now(),
        parentToolUseId: null,
      },
    ]);
    setError(null);
    setRateLimitInfo(null);
    setPromptSuggestions([]);

    vscode.postMessage({
      type: 'send_prompt',
      text,
      attachments,
      model: currentModelInfo?.value ?? model ?? undefined,
      modelSupportsImages,
    });
  }, [availableModels, model]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setSessionTitle(null);
    setCost(EMPTY_COST);
    setIsStreaming(false);
    setError(null);
    setRateLimitInfo(null);
    setPromptSuggestions([]);
    setToolActivity(null);
    setActiveFileEdit(null);
    setAgentTeamBoard(null);
    setWorkPlan(null);
    streamingUuidRef.current = null;
    resetStream();
  }, [resetStream]);

  const interrupt = useCallback(() => {
    vscode.postMessage({ type: 'interrupt' });
    setIsStreaming(false);
    setToolActivity(null);
    setAttachmentProcessing(null);
    setActiveFileEdit(null);
  }, []);

  return {
    messages,
    sessionTitle,
    sessionId,
    cost,
    isStreaming,
    model,
    error,
    rateLimitInfo,
    promptSuggestions,
    clearPromptSuggestions: () => setPromptSuggestions([]),
    processState,
    fastModeState,
    setFastModeState,
    availableModels,
    effortLevel,
    setEffortLevel,
    toolActivity,
    attachmentProcessing,
    activeFileEdit,
    workPlan,
    agentTeamBoard,
    agentTaskProgress,
    sendMessage,
    clearMessages,
    interrupt,
  };
}
