import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useChat } from '../../hooks/useChat';
import { useSession } from '../../hooks/useSession';
import { useProcessState } from '../../hooks/useProcessState';
import { useSlashCommands } from '../../hooks/useSlashCommands';
import { useAtMentions } from '../../hooks/useAtMentions';
import { useActiveFile } from '../../hooks/useActiveFile';
import { ChatHeader } from '../header/ChatHeader';
import { SessionList } from '../header/SessionList';
import { MessageList } from './MessageList';
import { CostDisplay } from '../shared/CostDisplay';
import { PermissionModeIndicator } from '../input/PermissionModeIndicator';
import { vscode } from '../../vscode';
import { ProviderBadge } from '../input/ProviderBadge';
import { ModelSelector } from '../input/ModelSelector';
import { FastModeToggle } from '../input/FastModeToggle';
import { EffortSelector } from '../input/EffortSelector';
import { CompanyAnnouncement } from './CompanyAnnouncement';
import { SpinnerStatus } from './SpinnerStatus';
import { ErrorBanner } from './ErrorBanner';
import { PromptSuggestions } from './PromptSuggestions';
import { AtMentionPicker } from '../input/AtMentionPicker';
import { SlashCommandMenu } from '../input/SlashCommandMenu';
import { AttachmentBar } from '../input/AttachmentBar';
import { McpServerManager } from '../dialogs/McpServerManager';
import { PluginManager } from '../dialogs/PluginManager';
import { PolicyPackManager } from '../dialogs/PolicyPackManager';
import { OnboardingChecklist } from '../onboarding/OnboardingChecklist';
import type { AtMentionResult } from '../../hooks/useAtMentions';
import type { ToolActivity, WorkPlanState } from '../../hooks/useChat';
import type { PermissionRequest } from '../../hooks/usePermissions';
import type { AttachmentItem } from '../../types/attachments';
import type { AgentTeamBoardState, FileEditMessageState } from '../../types/chat';
import {
  fromHostPermissionMode,
  toHostPermissionMode,
  type UiPermissionMode,
} from '../../utils/permissionMode';

interface CapabilityRecommendationView {
  id: string;
  kind: 'plugin' | 'mcp';
  title: string;
  capabilityLabel: string;
  rationale: string;
  reasonDetail: string;
  recommendedActionLabel: string;
  secondaryActionLabel?: string;
}

interface ChatPanelProps {
  permissionRequest?: PermissionRequest | null;
  permissionQueue?: PermissionRequest[];
  pendingPermissionCount?: number;
  onPermissionAllow?: (requestId: string, updatedInput?: Record<string, unknown>) => void;
  onPermissionAlwaysAllow?: (requestId: string) => void;
  onPermissionDeny?: (requestId: string) => void;
}

export function ChatPanel({
  permissionRequest = null,
  permissionQueue = [],
  pendingPermissionCount = 0,
  onPermissionAllow,
  onPermissionAlwaysAllow,
  onPermissionDeny,
}: ChatPanelProps) {
  const {
    messages,
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
    workPlan,
    agentTeamBoard,
    sendMessage,
    interrupt,
  } = useChat();

  const {
    status: processStatus,
    authError,
  } = useProcessState();

  const {
    groupedSessions,
    filteredSessions,
    searchQuery,
    setSearchQuery,
    isSessionListOpen,
    setSessionListOpen,
    activeSessionId,
    sessionTitle,
    resumeSession,
    deleteSession,
    newConversation,
  } = useSession();

  const [permissionMode, setPermissionMode] = useState<UiPermissionMode>('default');
  const [dismissedAnnouncementIds, setDismissedAnnouncementIds] = useState<Set<string>>(new Set());
  const [announcements, setAnnouncements] = useState<Array<{ id: string; message: string; severity?: 'info' | 'warning' | 'error'; dismissible?: boolean }>>([]);
  const [showMcpManager, setShowMcpManager] = useState(false);
  const [showPluginManager, setShowPluginManager] = useState(false);
  const [showPolicyPackManager, setShowPolicyPackManager] = useState(false);
  const [recommendation, setRecommendation] = useState<CapabilityRecommendationView | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('openclaude.onboarding.dismissed');
  });
  const [showAgentTeamBoard, setShowAgentTeamBoard] = useState(() => {
    return localStorage.getItem('openclaude.agentTeamBoard.visible') !== '0';
  });

  // Track whether the user has explicitly changed the permission mode this session
  const userSetModeRef = useRef(false);

  // Listen for system init messages to get the initial permission mode
  useEffect(() => {
    const unsub = vscode.onMessage('cli_output', (message) => {
      const data = message.data as Record<string, unknown> | undefined;
      if (data?.type === 'system' && data.subtype === 'init' && typeof data.permissionMode === 'string') {
        // Only apply init's permission mode if the user hasn't explicitly changed it
        if (!userSetModeRef.current) {
          setPermissionMode(fromHostPermissionMode(data.permissionMode as string));
        }
      }
      // Load company announcements from init
      if (data?.type === 'system' && data.subtype === 'init' && Array.isArray(data.companyAnnouncements)) {
        setAnnouncements(data.companyAnnouncements as typeof announcements);
      }
    });
    return unsub;
  }, []);

  // Keep the selector in sync with the host's actual permission mode
  useEffect(() => {
    const unsubModeChanged = vscode.onMessage('permission_mode_changed', (message) => {
      userSetModeRef.current = true;
      setPermissionMode(fromHostPermissionMode(message.mode as string));
    });
    const unsubModeRejected = vscode.onMessage('permission_mode_rejected', (message) => {
      if (typeof message.currentMode === 'string') {
        userSetModeRef.current = true;
        setPermissionMode(fromHostPermissionMode(message.currentMode as string));
      }
    });
    return () => {
      unsubModeChanged();
      unsubModeRejected();
    };
  }, []);

  useEffect(() => {
    return vscode.onMessage('extension_recommendation', (message) => {
      setRecommendation((message.recommendation as CapabilityRecommendationView | null) ?? null);
    });
  }, []);

  // Listen for open_plugin_manager and hide_onboarding messages
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'open_plugin_manager') setShowPluginManager(true);
      if (e.data?.type === 'open_mcp_manager') setShowMcpManager(true);
      if (e.data?.type === 'hide_onboarding') {
        setShowOnboarding(false);
        localStorage.setItem('openclaude.onboarding.dismissed', '1');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    localStorage.setItem('openclaude.agentTeamBoard.visible', showAgentTeamBoard ? '1' : '0');
  }, [showAgentTeamBoard]);

  // Rate limit countdown timer is now handled inside ErrorBanner component

  const handleModeChange = useCallback((mode: UiPermissionMode) => {
    userSetModeRef.current = true;
    vscode.postMessage({ type: 'set_permission_mode', mode: toHostPermissionMode(mode) });
  }, []);

  const isStarting = processState === 'starting';
  const latestAssistantText = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant')
    ?.blocks
    ?.filter((block) => block.block.type === 'text')
    .map((block) => ('text' in block.block ? block.block.text : ''))
    .join('\n')
    .trim() ?? '';
  const promptSuggestionVariant = looksLikeChoicePrompt(latestAssistantText, promptSuggestions)
    ? 'choices'
    : 'chips';

  return (
    <div
      style={{
        display: 'flex',
        overflow: 'hidden',
        position: 'relative',
        flexDirection: 'column',
        flex: 1,
        lineHeight: 1.5,
        height: '100vh',
        backgroundColor: 'var(--app-root-background)',
        color: 'var(--app-primary-foreground)',
      }}
    >
      {/* Header + Session list overlay wrapper */}
      <div style={{ position: 'relative', flexShrink: 0, zIndex: 10 }}>
        <ChatHeader
          sessionTitle={sessionTitle}
          isSessionListOpen={isSessionListOpen}
          onToggleSessionList={() => setSessionListOpen(!isSessionListOpen)}
          onNewConversation={() => { userSetModeRef.current = false; newConversation(); }}
        />

        {/* Session list overlay */}
        {isSessionListOpen && (
          <SessionList
            groupedSessions={groupedSessions}
            filteredSessions={filteredSessions}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeSessionId={activeSessionId}
            onResumeSession={resumeSession}
            onDeleteSession={deleteSession}
            onClose={() => setSessionListOpen(false)}
          />
        )}
      </div>

      {(workPlan || toolActivity || activeFileEdit || isStreaming) && (
        <AgentActivityStrip
          workPlan={workPlan}
          toolActivity={toolActivity}
          activeFileEdit={activeFileEdit}
          isStreaming={isStreaming}
          permissionMode={permissionMode}
        />
      )}

      {permissionRequest && (
        <PermissionRail
          request={permissionRequest}
          queue={permissionQueue}
          pendingCount={pendingPermissionCount}
          onAllow={onPermissionAllow}
          onAlwaysAllow={onPermissionAlwaysAllow}
          onDeny={onPermissionDeny}
        />
      )}

      {/* Message list */}
      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        processState={processState}
        toolActivity={toolActivity}
        activeFileEdit={activeFileEdit}
      />

      {/* Onboarding checklist */}
      {showOnboarding && (
        <div style={{ padding: '0 16px' }}>
          <OnboardingChecklist
            visible={showOnboarding}
            onDismiss={() => {
              setShowOnboarding(false);
              localStorage.setItem('openclaude.onboarding.dismissed', '1');
              vscode.postMessage({ type: 'hide_onboarding' });
            }}
            onOpenWalkthrough={() => vscode.postMessage({ type: 'open_walkthrough' })}
          />
        </div>
      )}
      {/* Company announcements */}
      <CompanyAnnouncement
        announcements={announcements.filter((a) => !dismissedAnnouncementIds.has(a.id))}
        onDismiss={(id) => setDismissedAnnouncementIds((prev) => new Set(prev).add(id))}
      />

      {recommendation && (
        <div style={{ padding: '0 16px 8px' }}>
          <CapabilityRecommendationCard recommendation={recommendation} />
        </div>
      )}

      {agentTeamBoard && (
        <div style={{ padding: '0 16px 10px', display: showAgentTeamBoard ? 'block' : 'none' }}>
          <AgentTeamBoardCard board={agentTeamBoard} />
        </div>
      )}

      {/* Spinner status during tool execution */}
      <SpinnerStatus
        isActive={isStreaming || !!attachmentProcessing}
        customVerbs={[]}
        customTips={[]}
        tipsEnabled={true}
        reducedMotion={false}
        message={attachmentProcessing ?? undefined}
      />

      {/* Prompt suggestions */}
      {promptSuggestions.length > 0 && !isStreaming && (
        <PromptSuggestions
          suggestions={promptSuggestions}
          onSelect={sendMessage}
          isVisible={!isStreaming}
          variant={promptSuggestionVariant}
          title={promptSuggestionVariant === 'choices' ? 'Choose a response' : 'Suggested prompts:'}
        />
      )}

      {/* Error / rate limit banner */}
      <ErrorBanner
        status={processStatus}
        rateLimitInfo={rateLimitInfo}
        authError={authError}
        error={error}
      />

      {/* Input area — Claude Code positions this absolutely; we use flow layout */}
      <div style={{ padding: '12px 16px', flexShrink: 0 }}>
        <div className="input-wrapper">
          <div
            className="input-container"
            data-permission-mode={permissionMode}
          >
            <InputArea
              isStreaming={isStreaming}
              isStarting={isStarting}
              onSend={sendMessage}
              onInterrupt={interrupt}
              effortLevel={effortLevel}
              onEffortChange={setEffortLevel}
              toolActivity={toolActivity}
              permissionMode={permissionMode}
            />
          </div>
        </div>

        {/* Footer: permission mode + cost + provider */}
        <div style={{ marginTop: 6, paddingLeft: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PermissionModeIndicator
              currentMode={permissionMode}
              onModeChange={handleModeChange}
            />
            <ProviderBadge />
            <ModelSelector currentModel={model} availableModels={availableModels} />
            <FastModeToggle
              isEnabled={fastModeState.enabled}
              canToggle={fastModeState.canToggle}
              onToggle={() => {
                const newEnabled = !fastModeState.enabled;
                setFastModeState({ ...fastModeState, enabled: newEnabled });
                vscode.postMessage({ type: 'toggle_fast_mode', enabled: newEnabled });
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {agentTeamBoard && (
              <button
                onClick={() => setShowAgentTeamBoard((prev) => !prev)}
                title={showAgentTeamBoard ? 'Hide agent team board' : 'Show agent team board'}
                style={{
                  fontSize: 10,
                  padding: '1px 5px',
                  cursor: 'pointer',
                  background: showAgentTeamBoard ? 'rgba(14, 165, 233, 0.14)' : 'transparent',
                  border: showAgentTeamBoard ? '1px solid rgba(14, 165, 233, 0.45)' : '1px solid var(--app-input-border)',
                  borderRadius: 'var(--corner-radius-small)',
                  color: showAgentTeamBoard ? 'var(--app-primary-foreground)' : 'var(--app-secondary-foreground)',
                }}
              >
                Agents
              </button>
            )}
            <button
              onClick={() => setShowMcpManager(true)}
              title="MCP Servers"
              style={{
                fontSize: 10, padding: '1px 5px', cursor: 'pointer',
                background: 'transparent', border: '1px solid var(--app-input-border)',
                borderRadius: 'var(--corner-radius-small)',
                color: 'var(--app-secondary-foreground)',
              }}
            >
              MCP
            </button>
            <button
              onClick={() => setShowPolicyPackManager(true)}
              title="Policy Packs"
              style={{
                fontSize: 10, padding: '1px 5px', cursor: 'pointer',
                background: 'transparent', border: '1px solid var(--app-input-border)',
                borderRadius: 'var(--corner-radius-small)',
                color: 'var(--app-secondary-foreground)',
              }}
            >
              Packs
            </button>
            <button
              onClick={() => setShowPluginManager(true)}
              title="Plugins"
              style={{
                fontSize: 10, padding: '1px 5px', cursor: 'pointer',
                background: 'transparent', border: '1px solid var(--app-input-border)',
                borderRadius: 'var(--corner-radius-small)',
                color: 'var(--app-secondary-foreground)',
              }}
            >
              Plugins
            </button>
            <CostDisplay cost={cost} className="" />
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <McpServerManager isOpen={showMcpManager} onClose={() => setShowMcpManager(false)} />
      <PluginManager isOpen={showPluginManager} onClose={() => setShowPluginManager(false)} />
      {showPolicyPackManager && <PolicyPackManager onClose={() => setShowPolicyPackManager(false)} />}
    </div>
  );
}

function looksLikeChoicePrompt(latestAssistantText: string, suggestions: string[]): boolean {
  if (suggestions.length === 0) {
    return false;
  }

  const normalized = latestAssistantText.toLowerCase();
  if (
    normalized.includes('would you like me to') ||
    normalized.includes('do you authorize me to') ||
    normalized.includes('do you want me to') ||
    normalized.includes('which option') ||
    normalized.includes('choose one') ||
    normalized.includes('select one')
  ) {
    return true;
  }

  if (suggestions.length >= 2) {
    return true;
  }

  const suggestion = suggestions[0]?.toLowerCase() ?? '';
  return (
    suggestion.startsWith('yes') ||
    suggestion.startsWith('no') ||
    suggestion.includes('proceed') ||
    suggestion.includes('skip')
  );
}

function AgentActivityStrip({
  workPlan,
  toolActivity,
  activeFileEdit,
  isStreaming,
  permissionMode,
}: {
  workPlan: WorkPlanState | null;
  toolActivity: ToolActivity | null;
  activeFileEdit: FileEditMessageState | null;
  isStreaming: boolean;
  permissionMode: UiPermissionMode;
}) {
  const done = workPlan?.items.filter((item) => item.status === 'completed').length ?? 0;
  const running = workPlan?.items.filter((item) => item.status === 'in_progress').length ?? 0;
  const open = workPlan?.items.filter((item) => item.status === 'pending').length ?? 0;
  const activeStep = workPlan?.items.find((item) => item.status === 'in_progress')
    ?? workPlan?.items.find((item) => item.status === 'pending');

  return (
    <div className="agent-activity-strip">
      <div className="agent-activity-top">
        <div className="agent-activity-pulse" aria-hidden="true" />
        <div className="agent-activity-copy">
          <div className="agent-activity-title">
            {toolActivity?.description
              ?? activeStep?.text
              ?? (isStreaming ? 'OpenClaude is working' : 'OpenClaude is ready')}
          </div>
          <div className="agent-activity-detail">
            <span>{permissionModeLabel(permissionMode)}</span>
            {workPlan ? <span>{workPlan.items.length} tasks ({done} done, {running} in progress, {open} open)</span> : null}
            {activeFileEdit ? <span>{activeFileEdit.fileName}: +{activeFileEdit.additions} -{activeFileEdit.deletions}</span> : null}
          </div>
        </div>
        {activeFileEdit ? (
          <button
            className="agent-activity-open"
            onClick={() => vscode.postMessage({ type: 'open_file', filePath: activeFileEdit.filePath })}
            title="Open active edit"
          >
            Open file
          </button>
        ) : null}
      </div>

      {workPlan && workPlan.items.length > 0 ? (
        <div className="agent-plan-list">
          {workPlan.items.map((item) => (
            <div key={item.id} className={`agent-plan-item agent-plan-item-${item.status}`}>
              <span className="agent-plan-marker" aria-hidden="true" />
              <span className="agent-plan-text">{item.text}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function permissionModeLabel(mode: UiPermissionMode): string {
  switch (mode) {
    case 'fullAccess':
      return 'Full access on';
    case 'plan':
      return 'Plan mode';
    default:
      return 'Default approvals';
  }
}

function PermissionRail({
  request,
  queue,
  pendingCount,
  onAllow,
  onAlwaysAllow,
  onDeny,
}: {
  request: PermissionRequest;
  queue: PermissionRequest[];
  pendingCount: number;
  onAllow?: (requestId: string, updatedInput?: Record<string, unknown>) => void;
  onAlwaysAllow?: (requestId: string) => void;
  onDeny?: (requestId: string) => void;
}) {
  const preview = formatPermissionPreview(request);
  const queuedTools = queue.slice(1, 4).map((item) => item.toolName);

  return (
    <div className={`permission-rail permission-rail-${request.riskLevel ?? 'low'}`}>
      <div className="permission-rail-header">
        <div className="permission-rail-copy">
          <div className="permission-rail-title">
            Approval needed: {request.title || request.toolName}
          </div>
          <div className="permission-rail-detail">
            <span>{request.riskLevel ?? 'low'} risk</span>
            {pendingCount > 1 ? <span>{pendingCount} requests waiting</span> : <span>1 request waiting</span>}
            {request.agentId ? <span>Agent {request.agentId}</span> : null}
          </div>
        </div>
        <div className="permission-rail-actions">
          <button
            className="permission-rail-button permission-rail-button-muted"
            onClick={() => onDeny?.(request.requestId)}
          >
            Deny
          </button>
          <button
            className="permission-rail-button permission-rail-button-muted"
            onClick={() => onAlwaysAllow?.(request.requestId)}
          >
            Always allow
          </button>
          <button
            className="permission-rail-button permission-rail-button-primary"
            onClick={() => onAllow?.(request.requestId)}
          >
            Allow
          </button>
        </div>
      </div>

      {request.decisionReason ? (
        <div className="permission-rail-reason">{request.decisionReason}</div>
      ) : null}

      <pre className="permission-rail-preview">{preview}</pre>

      {queuedTools.length > 0 ? (
        <div className="permission-rail-queue">
          Next: {queuedTools.join(', ')}
        </div>
      ) : null}
    </div>
  );
}

function formatPermissionPreview(request: PermissionRequest): string {
  const input = request.toolInput ?? {};

  const command = typeof input.command === 'string'
    ? input.command
    : typeof input.cmd === 'string'
      ? input.cmd
      : typeof input.script === 'string'
        ? input.script
        : null;

  if (command) {
    return command;
  }

  const filePath = typeof input.file_path === 'string'
    ? input.file_path
    : typeof input.path === 'string'
      ? input.path
      : typeof input.file === 'string'
        ? input.file
        : null;

  if (filePath) {
    return filePath;
  }

  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function AgentTeamBoardCard({ board }: { board: AgentTeamBoardState }) {
  const [settings, setSettings] = useState(() => ({
    mode: board.mode,
    maxWorkers: board.maxWorkers,
    useWorktrees: board.useWorktrees,
  }));
  const lastActiveSettingsRef = useRef({
    mode: board.mode === 'off' ? 'assist' as const : board.mode,
    maxWorkers: board.maxWorkers,
    useWorktrees: board.useWorktrees,
  });

  useEffect(() => {
    setSettings({
      mode: board.mode,
      maxWorkers: board.maxWorkers,
      useWorktrees: board.useWorktrees,
    });
    if (board.mode !== 'off') {
      lastActiveSettingsRef.current = {
        mode: board.mode,
        maxWorkers: board.maxWorkers,
        useWorktrees: board.useWorktrees,
      };
    }
  }, [board.maxWorkers, board.mode, board.useWorktrees]);

  const saveSettings = useCallback((next: typeof settings) => {
    if (next.mode !== 'off') {
      lastActiveSettingsRef.current = {
        mode: next.mode,
        maxWorkers: next.maxWorkers,
        useWorktrees: next.useWorktrees,
      };
    }
    setSettings(next);
    vscode.postMessage({
      type: 'set_agent_team_settings',
      mode: next.mode,
      maxWorkers: next.maxWorkers,
      useWorktrees: next.useWorktrees,
    });
  }, []);

  const restoreMode = useCallback((mode: 'assist' | 'coordinate') => {
    const base = lastActiveSettingsRef.current;
    saveSettings({
      mode,
      maxWorkers: settings.maxWorkers || base.maxWorkers,
      useWorktrees: settings.useWorktrees,
    });
  }, [saveSettings, settings.maxWorkers, settings.useWorktrees]);

  return (
    <div
      style={{
        border: '1px solid var(--app-input-border)',
        borderRadius: 'var(--corner-radius-medium, 12px)',
        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(14, 165, 233, 0.06))',
        padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--app-secondary-foreground)' }}>
            Agent team board
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--app-primary-foreground)', marginTop: 2 }}>
            {board.runningTaskCount > 0 ? `${board.runningTaskCount} workers active` : 'Ready for delegated work'}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--app-secondary-foreground)' }}>
            {board.mode} mode · worker budget {board.maxWorkers} · {board.useWorktrees ? 'worktree-aware' : 'same-tree execution'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <ModeChip
            label="Off"
            active={settings.mode === 'off'}
            onClick={() => saveSettings({ ...settings, mode: 'off' })}
          />
          <ModeChip
            label="Assist"
            active={settings.mode === 'assist'}
            onClick={() => restoreMode('assist')}
          />
          <ModeChip
            label="Coordinate"
            active={settings.mode === 'coordinate'}
            onClick={() => restoreMode('coordinate')}
          />
        </div>
      </div>

      <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 11, color: 'var(--app-secondary-foreground)', display: 'flex', alignItems: 'center', gap: 8 }}>
          Worker budget
          <input
            type="range"
            min={1}
            max={8}
            step={1}
            value={settings.maxWorkers}
            onChange={(event) => {
              const next = {
                ...settings,
                maxWorkers: Number(event.currentTarget.value),
              };
              saveSettings(next);
            }}
          />
          <span style={{ color: 'var(--app-primary-foreground)', minWidth: 12 }}>{settings.maxWorkers}</span>
        </label>
        <label style={{ fontSize: 11, color: 'var(--app-secondary-foreground)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={settings.useWorktrees}
            onChange={(event) => saveSettings({ ...settings, useWorktrees: event.currentTarget.checked })}
          />
          Prefer worktrees for parallel writes
        </label>
      </div>

      {(board.currentWorktreeName || board.worktreeAvailable) && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--app-secondary-foreground)' }}>
          {board.currentWorktreeName
            ? `Current worktree: ${board.currentWorktreeName}`
            : 'Multiple git worktrees available for safer parallel editing'}
        </div>
      )}

      {board.warnings.length > 0 && (
        <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
          {board.warnings.map((warning, index) => (
            <div
              key={`${warning}-${index}`}
              style={{
                borderRadius: 10,
                border: '1px solid rgba(245, 158, 11, 0.28)',
                background: 'rgba(245, 158, 11, 0.08)',
                color: 'var(--app-primary-foreground)',
                padding: '8px 10px',
                fontSize: 11,
              }}
            >
              {warning}
            </div>
          ))}
        </div>
      )}

      {board.tasks.length > 0 && (
        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          {board.tasks.slice(0, 6).map((task) => (
            <TaskActivityCard key={task.id} task={task} />
          ))}
        </div>
      )}

      {board.summaries.length > 0 && (
        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          {board.summaries.slice(0, 4).map((summary) => (
            <div
              key={summary.id}
              style={{
                border: '1px solid var(--app-input-border)',
                borderRadius: 10,
                padding: '9px 10px',
                background: 'rgba(15, 23, 42, 0.14)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--app-primary-foreground)' }}>
                  {summary.title}
                </div>
                <SummaryStatusBadge status={summary.statusCategory} />
              </div>
              <div style={{ marginTop: 5, fontSize: 11, color: 'var(--app-primary-foreground)' }}>
                {summary.description}
              </div>
              <div style={{ marginTop: 5, fontSize: 11, color: 'var(--app-secondary-foreground)' }}>
                Recent: {summary.recentAction}
              </div>
              <div style={{ marginTop: 3, fontSize: 11, color: 'var(--app-secondary-foreground)' }}>
                Next: {summary.needsAction}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskActivityCard({ task }: { task: AgentTeamBoardState['tasks'][number] }) {
  const [expanded, setExpanded] = useState(false);
  const runtime = task.durationMs > 0 ? `${Math.max(1, Math.round(task.durationMs / 1000))}s` : null;
  const summary = task.progressNote || task.summary || (task.lastToolName ? `Last tool: ${task.lastToolName}` : '');
  const hasDetails = task.events.length > 0;

  return (
    <div
      style={{
        border: '1px solid var(--app-input-border)',
        borderRadius: 10,
        padding: '9px 10px',
        background: 'rgba(255,255,255,0.02)',
        cursor: hasDetails ? 'pointer' : 'default',
      }}
      onClick={hasDetails ? () => setExpanded((prev) => !prev) : undefined}
      role={hasDetails ? 'button' : undefined}
      aria-expanded={hasDetails ? expanded : undefined}
      tabIndex={hasDetails ? 0 : undefined}
      onKeyDown={hasDetails ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setExpanded((prev) => !prev);
        }
      } : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--app-primary-foreground)' }}>
          {task.description}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {hasDetails ? (
            <span style={{ fontSize: 11, color: 'var(--app-secondary-foreground)' }}>
              {expanded ? 'Hide details' : 'Show details'}
            </span>
          ) : null}
          <TaskStatusBadge status={task.status} />
        </div>
      </div>
      <div
        style={{ marginTop: 4, fontSize: 11, color: 'var(--app-secondary-foreground)' }}
        title="Operations are background worker tool calls such as Read, Search, Bash, Edit, or Agent."
      >
        {task.workflowName || task.taskType || 'worker'}
        {task.toolUses > 0 ? ` · ${task.toolUses} operations` : ''}
        {task.tokenCount > 0 ? ` · ${task.tokenCount} tokens` : ' · token usage unavailable'}
        {runtime ? ` · ${runtime}` : ''}
      </div>
      {summary ? (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--app-primary-foreground)' }}>
          {summary}
        </div>
      ) : null}
      {expanded && task.events.length > 0 ? (
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          {task.events
            .slice()
            .reverse()
            .map((event) => (
              <div
                key={event.id}
                style={{
                  borderLeft: `2px solid ${taskEventAccent(event.tone)}`,
                  paddingLeft: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--app-primary-foreground)', fontWeight: 500 }}>
                    {event.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--app-secondary-foreground)', whiteSpace: 'nowrap' }}>
                    {formatTaskEventTime(event.timestamp)}
                  </div>
                </div>
                {event.detail ? (
                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--app-secondary-foreground)' }}>
                    {event.detail}
                  </div>
                ) : null}
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}

function ModeChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 9px',
        borderRadius: 999,
        border: active ? '1px solid rgba(14, 165, 233, 0.5)' : '1px solid var(--app-input-border)',
        background: active ? 'rgba(14, 165, 233, 0.14)' : 'transparent',
        color: 'var(--app-primary-foreground)',
        fontSize: 11,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function TaskStatusBadge({ status }: { status: AgentTeamBoardState['tasks'][number]['status'] }) {
  const palette = status === 'running'
    ? { background: 'rgba(14, 165, 233, 0.16)', border: 'rgba(14, 165, 233, 0.35)' }
    : status === 'completed'
      ? { background: 'rgba(16, 185, 129, 0.16)', border: 'rgba(16, 185, 129, 0.35)' }
      : { background: 'rgba(245, 158, 11, 0.16)', border: 'rgba(245, 158, 11, 0.35)' };

  return (
    <span
      style={{
        fontSize: 10,
        padding: '3px 8px',
        borderRadius: 999,
        border: `1px solid ${palette.border}`,
        background: palette.background,
        color: 'var(--app-primary-foreground)',
        textTransform: 'capitalize',
      }}
    >
      {status}
    </span>
  );
}

function SummaryStatusBadge({ status }: { status: AgentTeamBoardState['summaries'][number]['statusCategory'] }) {
  return (
    <span
      style={{
        fontSize: 10,
        padding: '3px 8px',
        borderRadius: 999,
        border: '1px solid var(--app-input-border)',
        color: 'var(--app-secondary-foreground)',
        textTransform: 'capitalize',
      }}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

function formatTaskEventTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function taskEventAccent(tone: 'info' | 'warning' | 'error' | 'success' | undefined): string {
  switch (tone) {
    case 'success':
      return 'rgba(16, 185, 129, 0.7)';
    case 'warning':
      return 'rgba(245, 158, 11, 0.7)';
    case 'error':
      return 'rgba(239, 68, 68, 0.7)';
    case 'info':
    default:
      return 'rgba(14, 165, 233, 0.7)';
  }
}

function CapabilityRecommendationCard({
  recommendation,
}: {
  recommendation: CapabilityRecommendationView;
}) {
  return (
    <div
      style={{
        border: '1px solid var(--app-input-border)',
        borderRadius: 'var(--corner-radius-medium, 12px)',
        background: 'linear-gradient(135deg, rgba(66, 153, 225, 0.08), rgba(16, 185, 129, 0.05))',
        padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--app-secondary-foreground)' }}>
            Recommended capability
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--app-primary-foreground)', marginTop: 2 }}>
            {recommendation.title}
          </div>
        </div>
        <div
          style={{
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 999,
            border: '1px solid var(--app-input-border)',
            color: 'var(--app-secondary-foreground)',
          }}
        >
          {recommendation.kind === 'mcp' ? 'MCP' : 'Plugin'}
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--app-primary-foreground)' }}>
        {recommendation.rationale}
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--app-secondary-foreground)' }}>
        {recommendation.reasonDetail}
      </div>

      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={() => vscode.postMessage({ type: 'recommendation_primary_action', recommendationId: recommendation.id })}
          style={{
            padding: '6px 10px',
            borderRadius: 'var(--corner-radius-small)',
            border: 'none',
            background: 'var(--vscode-button-background)',
            color: 'var(--vscode-button-foreground)',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {recommendation.recommendedActionLabel}
        </button>
        {recommendation.secondaryActionLabel && (
          <button
            onClick={() => vscode.postMessage({ type: 'recommendation_secondary_action', recommendationId: recommendation.id })}
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--corner-radius-small)',
              border: '1px solid var(--app-input-border)',
              background: 'transparent',
              color: 'var(--app-primary-foreground)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {recommendation.secondaryActionLabel}
          </button>
        )}
        <button
          onClick={() => vscode.postMessage({ type: 'recommendation_dismiss', recommendationId: recommendation.id })}
          style={{
            padding: '6px 10px',
            borderRadius: 'var(--corner-radius-small)',
            border: 'none',
            background: 'transparent',
            color: 'var(--app-secondary-foreground)',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Dismiss for session
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Input area — styled to match Claude Code's input container
// ============================================================================

interface InputAreaProps {
  isStreaming: boolean;
  isStarting: boolean;
  onSend: (text: string, attachments: AttachmentItem[]) => void;
  onInterrupt: () => void;
  effortLevel: string;
  onEffortChange: (level: string) => void;
  permissionMode?: string;
  toolActivity: ToolActivity | null;
}

function InputArea({ isStreaming, isStarting, onSend, onInterrupt, effortLevel, onEffortChange, toolActivity, permissionMode }: InputAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);

  // Slash commands
  const { filteredCommands, isLoaded: slashCommandsLoaded } = useSlashCommands();
  const [slashMenuVisible, setSlashMenuVisible] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const { results: atResults, isLoading: atLoading, query: queryAtMentions, clear: clearAtMentions } = useAtMentions();
  const [atPickerVisible, setAtPickerVisible] = useState(false);
  const atStartPosRef = useRef(-1);

  // Active file
  const { activeFile } = useActiveFile();

  // Listen for file picker results
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'file_picker_result') {
        const newAttachments: AttachmentItem[] = (message.files ?? []).map((f: { type: string; name: string; content: string }) => ({
          type: f.type as AttachmentItem['type'],
          name: f.name,
          content: f.content,
        }));
        setAttachments((prev) => [...prev, ...newAttachments]);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const doSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text && attachments.length === 0) return;
    if (isStreaming || isStarting) return;
    onSend(text, attachments);
    setInputValue('');
    setAttachments([]);
    setSlashMenuVisible(false);
    setAtPickerVisible(false);
    clearAtMentions();
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [inputValue, attachments, isStreaming, isStarting, onSend, clearAtMentions]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // If a picker is open, let it handle arrow keys / enter
    if (atPickerVisible || slashMenuVisible) {
      if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab'].includes(e.key)) {
        return; // pickers handle these via capture listener
      }
      if (e.key === 'Escape') {
        setAtPickerVisible(false);
        setSlashMenuVisible(false);
        clearAtMentions();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) {
        // Claude Code: Enter during streaming interrupts the current turn
        onInterrupt();
      } else {
        doSend();
      }
    }
    // Escape also stops streaming (like Claude Code)
    if (e.key === 'Escape' && isStreaming) {
      e.preventDefault();
      onInterrupt();
    }
  };

  const detectTriggers = useCallback((text: string, cursorPos: number) => {
    // Slash command: / at position 0
    if (text.startsWith('/')) {
      const query = text.slice(1);
      setSlashQuery(query);
      setSlashMenuVisible(true);
      setAtPickerVisible(false);
      clearAtMentions();
      return;
    } else if (slashMenuVisible) {
      setSlashMenuVisible(false);
      setSlashQuery('');
    }

    // @-mention: walk back from cursor to find @
    let atPos = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      const char = text[i];
      if (char === '@') {
        if (i === 0 || /\s/.test(text[i - 1])) {
          atPos = i;
        }
        break;
      }
      if (/\s/.test(char)) break;
    }

    if (atPos >= 0) {
      const query = text.slice(atPos + 1, cursorPos);
      atStartPosRef.current = atPos;
      setAtPickerVisible(true);
      queryAtMentions(query);
    } else if (atPickerVisible) {
      setAtPickerVisible(false);
      atStartPosRef.current = -1;
      clearAtMentions();
    }
  }, [slashMenuVisible, atPickerVisible, queryAtMentions, clearAtMentions]);

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const newValue = el.value;
    setInputValue(newValue);
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    detectTriggers(newValue, el.selectionStart);
  };

  const handleAtSelect = useCallback((result: AtMentionResult) => {
    const atPos = atStartPosRef.current;
    if (atPos < 0 || !textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart;
    const before = inputValue.slice(0, atPos);
    const after = inputValue.slice(cursorPos);
    const newText = before + result.insertText + ' ' + after;
    setInputValue(newText);
    setAtPickerVisible(false);
    atStartPosRef.current = -1;
    clearAtMentions();
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const newPos = atPos + result.insertText.length + 1;
        textareaRef.current.selectionStart = newPos;
        textareaRef.current.selectionEnd = newPos;
        textareaRef.current.focus();
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
      }
    });
  }, [inputValue, clearAtMentions]);

  const handleSlashSelect = useCallback((command: { name: string; argumentHint: string }) => {
    if (!command.argumentHint) {
      // No args needed — send directly as a user message
      onSend('/' + command.name, []);
      setInputValue('');
      setSlashMenuVisible(false);
      setSlashQuery('');
    } else {
      // Set input to the command so user can type args
      const newText = `/${command.name} `;
      setInputValue(newText);
      setSlashMenuVisible(false);
      setSlashQuery('');
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [onSend]);

  const handleSlashButtonClick = useCallback(() => {
    if (slashMenuVisible) {
      setSlashMenuVisible(false);
    } else {
      setSlashMenuVisible(true);
      setSlashQuery('');
    }
  }, [slashMenuVisible]);

  const handlePaperclipClick = useCallback(() => {
    vscode.postMessage({ type: 'file_picker_request' });
  }, []);

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardItems = Array.from(event.clipboardData?.items ?? []);
    const imageFiles = clipboardItems
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (imageFiles.length === 0) return;

    event.preventDefault();
    for (const file of imageFiles) {
      const reader = new FileReader();
      reader.onload = () => {
        const content = typeof reader.result === 'string' ? reader.result : '';
        if (!content) return;
        setAttachments((prev) => [
          ...prev,
          {
            type: 'image',
            name: file.name || `pasted-image-${Date.now()}.png`,
            content,
          },
        ]);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const [addMenuVisible, setAddMenuVisible] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  const handleAddClick = useCallback(() => {
    setAddMenuVisible((prev) => !prev);
  }, []);

  // Click outside to dismiss add menu
  useEffect(() => {
    if (!addMenuVisible) return;
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuVisible(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [addMenuVisible]);

  const handleActiveFileClick = useCallback(() => {
    if (!activeFile) return;
    const mention = `@${activeFile.filePath} `;
    if (textareaRef.current) {
      const pos = textareaRef.current.selectionStart;
      const before = inputValue.slice(0, pos);
      const after = inputValue.slice(pos);
      setInputValue(before + mention + after);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [activeFile, inputValue]);

  const placeholder = isStarting
    ? 'Starting OpenClaude...'
    : 'How can I help? (@ to mention files, / for commands)';

  // Claude Code: textarea is NEVER disabled during streaming — user can type while generating
  // Only disable during initial CLI startup
  const textareaDisabled = isStarting;
  // Send button disabled only during startup (not streaming — streaming shows stop button)
  const sendDisabled = isStarting;

  return (
    <div style={{ position: 'relative' }}>
      {/* Floating pickers — positioned above the input container */}
      <AtMentionPicker
        results={atResults}
        isLoading={atLoading}
        isVisible={atPickerVisible}
        onSelect={handleAtSelect}
        onDismiss={() => { setAtPickerVisible(false); clearAtMentions(); }}
      />
      <SlashCommandMenu
        commands={filteredCommands(slashQuery)}
        isVisible={slashMenuVisible}
        isLoaded={slashCommandsLoaded}
        query={slashQuery}
        onSelect={handleSlashSelect}
        onDismiss={() => { setSlashMenuVisible(false); setSlashQuery(''); }}
      />

      {/* Attachment bar */}
      <AttachmentBar
        attachments={attachments}
        onRemove={(i) => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
      />

      {/* Textarea row — matches Claude Code .messageInputContainer_cKsPxg layout */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
        <textarea
          ref={textareaRef}
          className="input"
          value={inputValue}
          placeholder={placeholder}
          disabled={textareaDisabled}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onPaste={handlePaste}
          onChange={() => {/* controlled via onInput */}}
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--app-input-foreground)',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            lineHeight: 1.5,
            maxHeight: 200,
            overflowY: 'auto',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
            padding: '10px 14px',
            minHeight: '1.5em',
            alignSelf: 'stretch',
          }}
        />

        {/* Send / Stop button — uses CSS .sendButton class (exact from Claude Code) */}
        <button
          className="sendButton"
          disabled={sendDisabled}
          onClick={() => {
            if (isStreaming) {
              onInterrupt();
            } else {
              doSend();
            }
          }}
          title={isStreaming ? 'Stop generation (Escape)' : 'Send message (Enter)'}
          data-permission-mode={permissionMode}
          style={{ flexShrink: 0, margin: '0 6px 8px 0' }}
        >
          {isStreaming ? (
            /* Stop icon */
            <svg className="stopIcon" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="3" width="10" height="10" rx="2" />
            </svg>
          ) : (
            /* Send icon — arrow up */
            <svg className="sendIcon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 12V4M4 8l4-4 4 4" />
            </svg>
          )}
        </button>
      </div>

      {/* Toolbar row — matches Claude Code .inputFooter_gGYT1w */}
      <div className="input-footer">
        {/* Left: action buttons */}
        <ToolbarIconButton onClick={handleSlashButtonClick} title="Slash commands" disabled={textareaDisabled}>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>/</span>
        </ToolbarIconButton>

        <ToolbarIconButton onClick={handlePaperclipClick} title="Attach file" disabled={textareaDisabled}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13.5 7.5l-6 6a4 4 0 01-5.66-5.66l6-6a2.5 2.5 0 013.54 3.54l-6 6a1 1 0 01-1.42-1.42l5.5-5.5" />
          </svg>
        </ToolbarIconButton>

        <div style={{ position: 'relative' }} ref={addMenuRef}>
          <ToolbarIconButton onClick={handleAddClick} title="Add content" disabled={textareaDisabled}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M8 3v10M3 8h10" />
            </svg>
          </ToolbarIconButton>
          {addMenuVisible && (
            <div
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                marginBottom: 4,
                minWidth: 200,
                background: 'var(--app-panel-background, var(--vscode-editorWidget-background))',
                border: '1px solid var(--app-input-border)',
                borderRadius: 'var(--corner-radius-small)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                zIndex: 50,
                overflow: 'hidden',
              }}
            >
              <AddContentMenuItem
                icon={<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 7.5l-6 6a4 4 0 01-5.66-5.66l6-6a2.5 2.5 0 013.54 3.54l-6 6a1 1 0 01-1.42-1.42l5.5-5.5" /></svg>}
                label="Upload from computer"
                onClick={() => {
                  vscode.postMessage({ type: 'file_picker_request' });
                  setAddMenuVisible(false);
                }}
              />
              <AddContentMenuItem
                icon={<span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14 }}>@</span>}
                label="Add context"
                onClick={() => {
                  setAddMenuVisible(false);
                  if (textareaRef.current) {
                    const pos = textareaRef.current.selectionStart;
                    const before = inputValue.slice(0, pos);
                    const after = inputValue.slice(pos);
                    setInputValue(before + '@' + after);
                    requestAnimationFrame(() => {
                      if (textareaRef.current) {
                        const newPos = pos + 1;
                        textareaRef.current.selectionStart = newPos;
                        textareaRef.current.selectionEnd = newPos;
                        textareaRef.current.focus();
                        detectTriggers(before + '@' + after, newPos);
                      }
                    });
                  }
                }}
              />
              <AddContentMenuItem
                icon={<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 1.5C6 4 5 6 5 8s1 4 3 6.5M8 1.5C10 4 11 6 11 8s-1 4-3 6.5M1.5 8h13"/></svg>}
                label="Browse the web"
                onClick={() => {
                  setAddMenuVisible(false);
                  if (textareaRef.current) {
                    const pos = textareaRef.current.selectionStart;
                    const before = inputValue.slice(0, pos);
                    const after = inputValue.slice(pos);
                    const mention = '@browser ';
                    setInputValue(before + mention + after);
                    requestAnimationFrame(() => {
                      if (textareaRef.current) {
                        const newPos = pos + mention.length;
                        textareaRef.current.selectionStart = newPos;
                        textareaRef.current.selectionEnd = newPos;
                        textareaRef.current.focus();
                      }
                    });
                  }
                }}
              />
            </div>
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Right: effort selector + active file indicator */}
        <EffortSelector
          currentEffort={effortLevel}
          disabled={textareaDisabled}
          onEffortChange={(level) => {
            onEffortChange(level);
            vscode.postMessage({ type: 'set_effort_level', level });
          }}
        />

        {/* Right: active file indicator */}
        {activeFile && (
          <button
            onClick={handleActiveFileClick}
            title={`Active: ${activeFile.filePath} — click to reference`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              borderRadius: 'var(--corner-radius-small)',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 11,
              color: 'var(--app-secondary-foreground)',
              maxWidth: 140,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, opacity: 0.6 }}>
              <path d="M13.85 4.44l-3.28-3.3A.5.5 0 0010.21 1H3.5A1.5 1.5 0 002 2.5v11A1.5 1.5 0 003.5 15h9a1.5 1.5 0 001.5-1.5V4.8a.5.5 0 00-.15-.36zM10.5 2.12L12.88 4.5H10.5V2.12zM13 13.5a.5.5 0 01-.5.5h-9a.5.5 0 01-.5-.5v-11a.5.5 0 01.5-.5H9.5V5h4v8.5z" />
            </svg>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeFile.fileName}</span>
          </button>
        )}
      </div>

      {/* Tool activity indicator */}
      {toolActivity && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 12px 2px',
          fontSize: 11,
          color: 'var(--app-secondary-foreground)',
          opacity: 0.8,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}>
          <span style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--vscode-charts-green, #66bb6a)',
            flexShrink: 0,
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {toolActivity.description}
          </span>
          <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
        </div>
      )}
    </div>
  );
}

function ToolbarIconButton({
  onClick,
  title,
  disabled = false,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        borderRadius: 'var(--corner-radius-small)',
        border: 'none',
        background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: 'var(--app-secondary-foreground)',
        opacity: disabled ? 0.4 : 1,
        padding: 0,
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = 'var(--app-ghost-button-hover-background)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      {children}
    </button>
  );
}

function AddContentMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '6px 12px',
        border: 'none',
        background: 'transparent',
        color: 'var(--app-primary-foreground)',
        fontSize: 12,
        cursor: 'pointer',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--app-ghost-button-hover-background, var(--vscode-list-hoverBackground))';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, flexShrink: 0, opacity: 0.7 }}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
