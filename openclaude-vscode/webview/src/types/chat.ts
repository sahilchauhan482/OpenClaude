/**
 * Chat-specific types used by the UI components and hooks.
 */

import type { ContentBlock } from './messages';
import type { AttachmentItem } from './attachments';

export interface FileEditPreview {
  contextBefore: string[];
  removed: string[];
  added: string[];
  contextAfter: string[];
  truncated: boolean;
}

export interface FileEditMessageState {
  stage: 'reviewing' | 'applied' | 'rejected';
  filePath: string;
  fileName: string;
  toolName: string;
  additions: number;
  deletions: number;
  preview?: FileEditPreview;
}

export interface SystemInlineMessageState {
  tone?: 'info' | 'warning' | 'error' | 'success';
  label?: string;
  title?: string;
  detail?: string;
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
  mode: 'off' | 'assist' | 'coordinate';
  maxWorkers: number;
  useWorktrees: boolean;
  worktreeAvailable: boolean;
  currentWorktreeName?: string | null;
  runningTaskCount: number;
  warnings: string[];
  tasks: AgentTeamTaskState[];
  summaries: AgentTeamSummaryState[];
}

/** A renderable content block with streaming state */
export interface RenderableBlock {
  /** Index of this block in the assistant message */
  index: number;
  /** The content block (may be partial during streaming) */
  block: ContentBlock;
  /** Whether this block is still receiving deltas */
  isStreaming: boolean;
}

/** A single chat message in the UI */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  /** For user messages: the text content */
  text?: string;
  /** For richer inline system messages */
  system?: SystemInlineMessageState;
  /** For user messages: the original attachments so images can stay visible */
  attachments?: AttachmentItem[];
  /** For system file-edit cards */
  fileEdit?: FileEditMessageState;
  /** For assistant messages: array of renderable content blocks */
  blocks?: RenderableBlock[];
  /** Whether this message is currently streaming */
  isStreaming: boolean;
  /** Timestamp */
  timestamp: number;
  /** Parent tool_use_id (null for top-level messages, set for sub-agent responses) */
  parentToolUseId: string | null;
  /** Model that generated this message (for assistant messages) */
  model?: string;
}

/** Accumulated state of a single streaming assistant turn */
export interface StreamState {
  /** UUID of the current streaming message */
  uuid: string;
  /** Content blocks being built up from deltas */
  blocks: RenderableBlock[];
  /** Model ID from message_start */
  model: string;
  /** Whether the stream is active */
  isActive: boolean;
  /** Parent tool_use_id */
  parentToolUseId: string | null;
  /** Accumulated input JSON for tool_use blocks (keyed by block index) */
  toolInputBuffers: Record<number, string>;
}

/** Tool call display data (derived from ToolUseBlock + ToolResultBlock) */
export interface ToolCallDisplay {
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** Tool result (if received) */
  output?: string | ContentBlock[];
  isError?: boolean;
  /** Whether the tool is still executing */
  isRunning: boolean;
}

/** Session-level cost and usage info, updated from result messages */
export interface SessionCost {
  totalCostUSD: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  numTurns: number;
  durationMs: number;
}

/** Overall chat state managed by useChat */
export interface ChatState {
  messages: ChatMessage[];
  sessionTitle: string | null;
  sessionId: string | null;
  cost: SessionCost;
  isStreaming: boolean;
  model: string | null;
  error: string | null;
  agentTeamBoard?: AgentTeamBoardState | null;
}
