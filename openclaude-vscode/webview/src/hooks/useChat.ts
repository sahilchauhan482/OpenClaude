import { useState, useCallback, useEffect, useRef } from 'react';
import { vscode } from '../vscode';
import { useStream } from './useStream';
import type { ChatMessage, FileEditMessageState, SessionCost } from '../types/chat';
import type { AttachmentItem } from '../types/attachments';
import { describeUserMessageContent } from '../utils/messageContent';
import { getProviderStateModel } from '../utils/providerState';
import { resolveModelSupportsImages } from '../utils/modelCapabilities';
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

  // Map known tool names to human-readable descriptions
  const name = toolName.toLowerCase();

  if (name.includes('bash') || name.includes('terminal')) {
    const cmd = input?.command as string;
    if (cmd) {
      const short = cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd;
      return `Running: ${short}`;
    }
    return 'Running command...';
  }

  if (name.includes('edit') || name.includes('write') || name.includes('file_edit')) {
    const filePath = (input?.file_path ?? input?.path ?? input?.filename) as string;
    if (filePath) {
      const fileName = filePath.split('/').pop() ?? filePath;
      return `Editing ${fileName}`;
    }
    return 'Editing file...';
  }

  if (name.includes('read')) {
    const filePath = (input?.file_path ?? input?.path ?? input?.filename) as string;
    if (filePath) {
      const fileName = filePath.split('/').pop() ?? filePath;
      return `Reading ${fileName}`;
    }
    return 'Reading file...';
  }

  if (name.includes('search') || name.includes('grep') || name.includes('glob')) {
    const pattern = (input?.pattern ?? input?.query ?? input?.regex) as string;
    if (pattern) return `Searching: ${pattern}`;
    return 'Searching...';
  }

  if (name.includes('web') || name.includes('fetch') || name.includes('browser')) {
    return 'Browsing web...';
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
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === uuid ? { ...msg, blocks: update.blocks } : msg,
            ),
          );
          // Extract tool activity from tool_use blocks
          if (update.type === 'block_start' && update.blocks) {
            const latestBlock = update.blocks[update.blocks.length - 1];
            if (latestBlock) {
              const block = latestBlock.block;
              if (block.type === 'tool_use' || block.type === 'server_tool_use') {
                const toolInput = (block as { input?: Record<string, unknown> }).input;
                setToolActivity({
                  toolName: block.name,
                  description: formatToolActivity(block.name, undefined, toolInput),
                });
              }
            }
          }
          break;
        }

        case 'message_stop': {
          const uuid = streamingUuidRef.current;
          if (uuid) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === uuid
                  ? {
                      ...msg,
                      isStreaming: false,
                      blocks: msg.blocks?.map((b) => ({ ...b, isStreaming: false })),
                    }
                  : msg,
              ),
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
    const blocks = (msg.message.content || []).map((block, index) => ({
      index,
      block,
      isStreaming: false,
    }));

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
      const resultText = (msg as unknown as Record<string, unknown>).result as string | undefined;
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
  const addSystemMessage = useCallback((text: string, id?: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: id ?? `sys-${Date.now()}`,
        role: 'system' as const,
        text,
        isStreaming: false,
        timestamp: Date.now(),
        parentToolUseId: null,
      },
    ]);
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

      // Unwrap cli_output envelope
      const msg: SDKMessage = data.type === 'cli_output' ? data.data : data;
      if (!msg || typeof msg !== 'object') return;

      try {
        const msgAny = msg as Record<string, unknown>;

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
              const resultAny = msg as Record<string, unknown>;
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
            // Show tool progress inline — update last assistant message or add system msg
            const toolName = msgAny.tool_name as string ?? 'tool';
            const progress = msgAny.progress as string ?? '';
            // Update tool activity indicator
            if (toolName || progress) {
              setToolActivity({
                toolName,
                description: formatToolActivity(toolName, progress, undefined),
              });
            }
            // Don't add a message for every progress tick — just update streaming state
            if (progress) {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant' && last.isStreaming) {
                  return prev; // already showing streaming indicator
                }
                return prev;
              });
            }
            break;
          }

          case 'tool_use_summary': {
            const toolName = msgAny.tool_name as string ?? 'tool';
            const summary = msgAny.summary as string ?? '';
            if (summary) {
              addSystemMessage(`${toolName}: ${summary}`, `tool-summary-${Date.now()}`);
            }
            // Clear tool activity after summary
            setToolActivity(null);
            break;
          }

          case 'prompt_suggestion': {
            const suggestion = msgAny.suggestion as string;
            if (suggestion) {
              setPromptSuggestions((prev) =>
                [...prev.filter((s) => s !== suggestion), suggestion].slice(-5),
              );
            }
            break;
          }

          case 'system': {
            const subtype = msgAny.subtype as string;
            switch (subtype) {
              case 'init':
                handleSystemInit(msg as SystemInitMessage);
                {
                  const initAny = msg as Record<string, unknown>;
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
              case 'api_retry': {
                const attempt = msgAny.attempt as number ?? 1;
                addSystemMessage(`Retrying API call (attempt ${attempt})...`, `retry-${Date.now()}`);
                break;
              }
              case 'compact_boundary':
                addSystemMessage('Context compacted to fit within limits.', `compact-${Date.now()}`);
                break;
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
              const blocks = contentArr.map((block, index) => ({
                index,
                block: block as unknown as import('../types/messages').ContentBlock,
                isStreaming: false,
              }));
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
    processState,
    fastModeState,
    setFastModeState,
    availableModels,
    effortLevel,
    setEffortLevel,
    toolActivity,
    attachmentProcessing,
    activeFileEdit,
    sendMessage,
    clearMessages,
    interrupt,
  };
}
