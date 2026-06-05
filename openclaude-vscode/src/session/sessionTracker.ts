import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as readline from 'readline';
import {
  collectJsonlFiles,
  inferTranscriptSessionId,
  workspacePathToClaudeProjectDir,
} from './sessionDiscovery';

export interface SessionInfo {
  /** UUID — matches the JSONL filename without extension */
  id: string;
  /** From ai-title system message, or first non-meta user message, or 'Untitled Session' */
  title: string;
  /** Model string from first assistant message (e.g., 'gpt-5.4', 'claude-sonnet-4-20250514') */
  model: string;
  /** Provider family inferred from transcript metadata when available */
  provider?: string;
  /** Last message timestamp (most recent activity) */
  timestamp: Date;
  /** First message timestamp (session creation) */
  createdAt: Date;
  /** Count of user + assistant messages, excluding isMeta and file-history-snapshot */
  messageCount: number;
  /** Project directory name in ~/.claude/projects/ or ~/.openclaude/projects/ */
  projectDir: string;
  /** Absolute path to the .jsonl file */
  filePath: string;
  /** Working directory from first message with a cwd field */
  cwd: string;
  /** Git branch from first message with a gitBranch field */
  gitBranch: string;
}

export type SessionGroup = 'Today' | 'Yesterday' | 'This Week' | 'This Month' | 'Older';

export interface GroupedSessions {
  group: SessionGroup;
  sessions: SessionInfo[];
}

interface CodexSessionIndexEntry {
  title: string;
  updatedAt?: Date;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return '';
  }

  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') {
      continue;
    }
    const item = block as Record<string, unknown>;
    if (typeof item.text === 'string') {
      parts.push(item.text);
      continue;
    }
    if (typeof item.content === 'string') {
      parts.push(item.content);
      continue;
    }
    if (Array.isArray(item.content)) {
      const nested = extractTextFromContent(item.content);
      if (nested) {
        parts.push(nested);
      }
    }
  }

  return parts.join('\n').trim();
}

function normalizeSessionProvider(rawProvider: string | undefined, isCodexSession: boolean): string | undefined {
  const normalized = rawProvider?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (isCodexSession && normalized === 'openai') {
    return 'codex';
  }

  return normalized;
}

function normalizeSessionModel(rawModel: string | undefined): string | undefined {
  const normalized = rawModel?.trim();
  if (!normalized) {
    return undefined;
  }

  const lowered = normalized.toLowerCase();
  if (lowered === '<synthetic>' || lowered === 'synthetic') {
    return undefined;
  }

  return normalized;
}

export class SessionTracker implements vscode.Disposable {
  private sessions: Map<string, SessionInfo> = new Map();
  private codexSessionIndex: Map<string, CodexSessionIndexEntry> = new Map();
  private watchers: vscode.FileSystemWatcher[] = [];
  private readonly _onSessionsChanged = new vscode.EventEmitter<SessionInfo[]>();
  public readonly onSessionsChanged = this._onSessionsChanged.event;
  private disposables: vscode.Disposable[] = [];
  private readonly managedRootsOverride?: string[];

  constructor(options?: { managedRoots?: string[] }) {
    this.managedRootsOverride = options?.managedRoots?.map((root) => path.resolve(root));
    this.disposables.push(this._onSessionsChanged);
  }

  /** Initialize: scan existing files, start watching for changes. */
  async initialize(): Promise<void> {
    await this.scanAllSessions();
    this.startWatching();
  }

  /** ~/.claude/projects/ */
  private getProjectsDir(): string {
    return path.join(os.homedir(), '.claude', 'projects');
  }

  /** ~/.openclaude/projects/ */
  private getOpenClaudeProjectsDir(): string {
    return path.join(os.homedir(), '.openclaude', 'projects');
  }

  /** ~/.codex/sessions/ */
  private getCodexSessionsDir(): string {
    return path.join(os.homedir(), '.codex', 'sessions');
  }

  private getCodexSessionIndexPath(): string {
    return path.join(os.homedir(), '.codex', 'session_index.jsonl');
  }

  /** Managed session roots across providers. */
  private getManagedSessionRoots(): string[] {
    if (this.managedRootsOverride && this.managedRootsOverride.length > 0) {
      return this.managedRootsOverride;
    }
    return [this.getProjectsDir(), this.getOpenClaudeProjectsDir(), this.getCodexSessionsDir()];
  }

  private isManagedSessionFile(filePath: string): boolean {
    const normalized = path.resolve(filePath).toLowerCase();
    return this.getManagedSessionRoots().some((root) => {
      const resolvedRoot = path.resolve(root).toLowerCase();
      return normalized === resolvedRoot || normalized.startsWith(`${resolvedRoot}${path.sep}`);
    });
  }

  private removeTrackedSessionByFilePath(filePath: string): void {
    for (const [id, session] of this.sessions.entries()) {
      if (path.resolve(session.filePath) === path.resolve(filePath)) {
        this.sessions.delete(id);
      }
    }
  }

  private isCodexSessionFile(filePath: string): boolean {
    const normalized = path.resolve(filePath).toLowerCase();
    const codexRoot = path.resolve(this.getCodexSessionsDir()).toLowerCase();
    return (
      normalized.startsWith(`${codexRoot}${path.sep}`)
      || path.basename(filePath).toLowerCase().startsWith('rollout-')
    );
  }

  private async refreshCodexSessionIndex(): Promise<void> {
    this.codexSessionIndex.clear();

    const indexPath = this.getCodexSessionIndexPath();
    if (!fs.existsSync(indexPath)) {
      return;
    }

    try {
      const fileStream = fs.createReadStream(indexPath, { encoding: 'utf-8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (!line.trim()) {
          continue;
        }
        let entry: Record<string, unknown>;
        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }

        if (typeof entry.id !== 'string' || typeof entry.thread_name !== 'string') {
          continue;
        }

        const updatedAt = typeof entry.updated_at === 'string'
          ? new Date(entry.updated_at as string)
          : undefined;
        this.codexSessionIndex.set(entry.id, {
          title: entry.thread_name,
          updatedAt,
        });
      }
    } catch (err) {
      console.error('SessionTracker: failed to read Codex session index:', err);
    }
  }

  /**
   * Derive the project directory name for the current workspace.
   * Convention: absolute path with all / replaced by - .
   * Example: /Users/harsh/workspace/myproject -> -Users-harsh-workspace-myproject
   */
  getProjectDirForWorkspace(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return undefined;
    }
    return workspacePathToClaudeProjectDir(folders[0].uri.fsPath);
  }

  /** Scan all JSONL files across supported provider session roots. */
  async scanAllSessions(): Promise<void> {
    this.sessions.clear();
    await this.refreshCodexSessionIndex();

    const files = Array.from(
      new Set(
        this.getManagedSessionRoots().flatMap((root) => collectJsonlFiles(root)),
      ),
    );

    await Promise.all(files.map((filePath) => this.parseSessionFile(filePath)));
    this._onSessionsChanged.fire(this.getSessionList());
  }

  /**
   * Parse a single JSONL file to extract session metadata.
   * Uses readline to stream line-by-line (never loads entire file into memory).
   */
  async parseSessionFile(filePath: string): Promise<void> {
    const filename = path.basename(filePath, '.jsonl');
    const projectDir = path.basename(path.dirname(filePath));
    let usesCodexShape = this.isCodexSessionFile(filePath);

    let sessionId = filename;
    let title = '';
    let fallbackTitle = '';
    let model = '';
    let provider = '';
    let firstTimestamp: Date | undefined;
    let lastTimestamp: Date | undefined;
    let messageCount = 0;
    let cwd = '';
    let gitBranch = '';

    try {
      const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (!line.trim()) {
          continue;
        }
        let entry: Record<string, unknown>;
        try {
          entry = JSON.parse(line);
        } catch {
          continue; // Skip malformed lines
        }

        sessionId = inferTranscriptSessionId(entry, sessionId);

        const payload = entry.payload as Record<string, unknown> | undefined;
        const payloadType = typeof payload?.type === 'string' ? payload.type : undefined;
        const payloadRole = typeof payload?.role === 'string' ? payload.role : undefined;
        if (entry.type === 'turn_context' || entry.type === 'response_item' || entry.type === 'event_msg') {
          usesCodexShape = true;
        }

        // Track timestamps
        if (typeof entry.timestamp === 'string') {
          const ts = new Date(entry.timestamp as string);
          if (!firstTimestamp || ts < firstTimestamp) {
            firstTimestamp = ts;
          }
          if (!lastTimestamp || ts > lastTimestamp) {
            lastTimestamp = ts;
          }
        }

        // Extract cwd and gitBranch from first entry that has them
        if (!cwd) {
          if (typeof entry.cwd === 'string') {
            cwd = entry.cwd as string;
          } else if (payload && typeof payload.cwd === 'string') {
            cwd = payload.cwd as string;
          }
        }
        if (!gitBranch) {
          if (typeof entry.gitBranch === 'string') {
            gitBranch = entry.gitBranch as string;
          } else if (payload && typeof payload.gitBranch === 'string') {
            gitBranch = payload.gitBranch as string;
          } else if (payload && typeof payload.git_branch === 'string') {
            gitBranch = payload.git_branch as string;
          }
        }

        // Count user messages (skip meta messages)
        const isClaudeUserMessage = entry.type === 'user' && !entry.isMeta;
        const isCodexUserMessage =
          usesCodexShape &&
          entry.type === 'response_item' &&
          payloadType === 'message' &&
          payloadRole === 'user';

        if (isClaudeUserMessage || isCodexUserMessage) {
          messageCount++;
          // Extract fallback title from first non-meta user message
          if (!fallbackTitle) {
            const msg = entry.message as Record<string, unknown> | undefined;
            const text = msg ? extractTextFromContent(msg.content) : extractTextFromContent(payload?.content);
            if (text) {
              // Skip command/caveat messages as fallback titles
              if (
                !text.startsWith('<command-name>') &&
                !text.startsWith('<local-command')
              ) {
                fallbackTitle = text.slice(0, 120);
              }
            }
          }
        }

        // Count assistant messages and extract model
        const isClaudeAssistantMessage = entry.type === 'assistant';
        const isCodexAssistantMessage =
          usesCodexShape &&
          entry.type === 'response_item' &&
          payloadType === 'message' &&
          payloadRole === 'assistant';

        if (isClaudeAssistantMessage || isCodexAssistantMessage) {
          messageCount++;
          const msg = entry.message as Record<string, unknown> | undefined;
          const msgModel = typeof msg?.model === 'string' ? normalizeSessionModel(msg.model) : undefined;
          const payloadModel = typeof payload?.model === 'string' ? normalizeSessionModel(payload.model) : undefined;
          if (msgModel) {
            model = msgModel;
          } else if (payloadModel) {
            model = payloadModel;
          }
        }

        if (!provider && entry.type === 'session_meta') {
          const payloadProvider = typeof payload?.model_provider === 'string'
            ? payload.model_provider
            : typeof payload?.provider === 'string'
              ? payload.provider
              : undefined;
          const normalizedProvider = normalizeSessionProvider(payloadProvider, this.isCodexSessionFile(filePath));
          if (normalizedProvider) {
            provider = normalizedProvider;
          }
        }

        if (usesCodexShape && !title) {
          if (
            entry.type === 'event_msg' &&
            payload?.type === 'task_complete' &&
            typeof payload.last_agent_message === 'string'
          ) {
            fallbackTitle = fallbackTitle || payload.last_agent_message.slice(0, 120);
          }
          if (
            entry.type === 'turn_context' &&
            typeof payload?.model === 'string'
          ) {
            const normalizedModel = normalizeSessionModel(payload.model);
            if (normalizedModel) {
              model = normalizedModel;
            }
          }
        }

        // ai-title system message overrides any fallback title
        if (
          entry.type === 'system' &&
          entry.subtype === 'ai-title' &&
          typeof (entry as Record<string, unknown>).title === 'string'
        ) {
          title = (entry as Record<string, unknown>).title as string;
        }
      }
    } catch (err) {
      console.error(`SessionTracker: failed to parse ${filePath}:`, err);
      return;
    }

    if (!firstTimestamp) {
      return; // Empty or completely unparseable file
    }

    const codexIndex = this.codexSessionIndex.get(sessionId);
    if (!title && codexIndex?.title) {
      title = codexIndex.title;
    }
    if (!lastTimestamp && codexIndex?.updatedAt) {
      lastTimestamp = codexIndex.updatedAt;
    }

    this.removeTrackedSessionByFilePath(filePath);
    this.sessions.set(sessionId, {
        id: sessionId,
        title: title || fallbackTitle || 'Untitled Session',
        model: model || 'unknown',
        provider: provider || undefined,
        timestamp: lastTimestamp || firstTimestamp,
        createdAt: firstTimestamp,
      messageCount,
      projectDir,
      filePath,
      cwd,
      gitBranch,
    });
  }

  /** Watch for new/changed/deleted JSONL files in the project directory. */
  private startWatching(): void {
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers = [];

    for (const root of this.getManagedSessionRoots()) {
      if (!fs.existsSync(root)) {
        continue;
      }

      const pattern = new vscode.RelativePattern(vscode.Uri.file(root), '**/*.jsonl');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      watcher.onDidCreate(async (uri) => {
        await this.parseSessionFile(uri.fsPath);
        this._onSessionsChanged.fire(this.getSessionList());
      });
      watcher.onDidChange(async (uri) => {
        await this.parseSessionFile(uri.fsPath);
        this._onSessionsChanged.fire(this.getSessionList());
      });
      watcher.onDidDelete((uri) => {
        this.removeTrackedSessionByFilePath(uri.fsPath);
        this._onSessionsChanged.fire(this.getSessionList());
      });

      this.watchers.push(watcher);
      this.disposables.push(watcher);
    }
  }

  /** All sessions sorted by timestamp descending. */
  getSessionList(): SessionInfo[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );
  }

  /** Sessions grouped into time-period buckets, only including non-empty groups. */
  getGroupedSessions(): GroupedSessions[] {
    const sessions = this.getSessionList();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
    const weekStart = new Date(todayStart.getTime() - 7 * 86_400_000);
    const monthStart = new Date(todayStart.getTime() - 30 * 86_400_000);

    const buckets: Record<SessionGroup, SessionInfo[]> = {
      'Today': [],
      'Yesterday': [],
      'This Week': [],
      'This Month': [],
      'Older': [],
    };

    for (const s of sessions) {
      const t = s.timestamp.getTime();
      if (t >= todayStart.getTime()) {
        buckets['Today'].push(s);
      } else if (t >= yesterdayStart.getTime()) {
        buckets['Yesterday'].push(s);
      } else if (t >= weekStart.getTime()) {
        buckets['This Week'].push(s);
      } else if (t >= monthStart.getTime()) {
        buckets['This Month'].push(s);
      } else {
        buckets['Older'].push(s);
      }
    }

    const order: SessionGroup[] = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'];
    return order
      .filter((g) => buckets[g].length > 0)
      .map((g) => ({ group: g, sessions: buckets[g] }));
  }

  /** Search sessions by keyword (matches title, model, gitBranch). */
  searchSessions(query: string): SessionInfo[] {
    const q = query.toLowerCase();
    return this.getSessionList().filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.model.toLowerCase().includes(q) ||
        s.gitBranch.toLowerCase().includes(q),
    );
  }

  /** Get a single session by its UUID. */
  getSession(id: string): SessionInfo | undefined {
    return this.sessions.get(id);
  }

  /** Delete a session by removing its JSONL file. Only deletes inside ~/.claude/projects/. */
  async deleteSession(id: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session) {
      return false;
    }
    // Safety: never delete outside managed session roots
    if (!this.isManagedSessionFile(session.filePath)) {
      console.error('SessionTracker: refusing to delete file outside projects dir');
      return false;
    }
    try {
      await fs.promises.unlink(session.filePath);
      this.sessions.delete(id);
      this._onSessionsChanged.fire(this.getSessionList());
      return true;
    } catch (err) {
      console.error(`SessionTracker: failed to delete session ${id}:`, err);
      return false;
    }
  }

  private async loadCodexTranscriptMessages(filePath: string, sessionId: string): Promise<Array<Record<string, unknown>>> {
    const directMessages: Array<Record<string, unknown>> = [];
    const fallbackMessages: Array<Record<string, unknown>> = [];
    let currentModel = this.sessions.get(sessionId)?.model || 'unknown';
    let usesCodexShape = this.isCodexSessionFile(filePath);

    try {
      const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (!line.trim()) {
          continue;
        }
        let entry: Record<string, unknown>;
        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }

        const payload = entry.payload as Record<string, unknown> | undefined;
        const payloadType = typeof payload?.type === 'string' ? payload.type : undefined;
        const payloadRole = typeof payload?.role === 'string' ? payload.role : undefined;
        if (entry.type === 'turn_context' || entry.type === 'response_item' || entry.type === 'event_msg') {
          usesCodexShape = true;
        }

        if (entry.type === 'turn_context' && typeof payload?.model === 'string') {
          currentModel = payload.model as string;
          continue;
        }

        if (entry.type === 'user' && !entry.isMeta) {
          const msg = entry.message as Record<string, unknown> | undefined;
          const content = msg?.content ?? entry.content ?? payload?.content;
          const hasContent =
            (typeof content === 'string' && content.trim().length > 0) ||
            (Array.isArray(content) && content.length > 0);
          if (!hasContent) {
            continue;
          }

          directMessages.push({
            type: 'user',
            uuid: (entry.uuid as string) || `${sessionId}-user-${directMessages.length}`,
            sessionId,
            timestamp: entry.timestamp,
            isMeta: false,
            message: {
              role: 'user',
              content,
            },
          });
          continue;
        }

        if (entry.type === 'assistant') {
          const msg = entry.message as Record<string, unknown> | undefined;
          const content = msg?.content ?? entry.content ?? payload?.content;
          const hasContent =
            (typeof content === 'string' && content.trim().length > 0) ||
            (Array.isArray(content) && content.length > 0);
          if (!hasContent) {
            continue;
          }

          const contentBlocks = Array.isArray(content)
            ? content
            : [{ type: 'text', text: String(content) }];
          directMessages.push({
            type: 'assistant',
            uuid: (entry.uuid as string) || `${sessionId}-assistant-${directMessages.length}`,
            sessionId,
            timestamp: entry.timestamp,
            message: {
              role: 'assistant',
              model: typeof msg?.model === 'string' ? msg.model : currentModel,
              content: contentBlocks,
            },
          });
          continue;
        }

        if (usesCodexShape && entry.type === 'response_item' && payloadType === 'message') {
          const text = extractTextFromContent(payload?.content);
          if (!text) {
            continue;
          }

          if (payloadRole === 'user') {
            fallbackMessages.push({
              type: 'user',
              uuid: `${sessionId}-user-${fallbackMessages.length}`,
              sessionId,
              timestamp: entry.timestamp,
              isMeta: false,
              message: {
                role: 'user',
                content: text,
              },
            });
            continue;
          }

          if (payloadRole === 'assistant') {
            fallbackMessages.push({
              type: 'assistant',
              uuid: `${sessionId}-assistant-${fallbackMessages.length}`,
              sessionId,
              timestamp: entry.timestamp,
              message: {
                role: 'assistant',
                model: currentModel,
                content: [{ type: 'text', text }],
              },
            });
          }
        }
      }
    } catch (err) {
      console.error(`SessionTracker: failed to load Codex messages for ${sessionId}:`, err);
    }

    return directMessages.length > 0 ? directMessages : fallbackMessages;
  }

  /**
   * Load full user/assistant messages from a session's JSONL file.
   * Returns them in order for replaying into the webview on resume.
   */
  async loadSessionMessages(sessionId: string): Promise<Array<Record<string, unknown>>> {
    // Try sessions map first, then construct the path as fallback
    let filePath = this.sessions.get(sessionId)?.filePath;
    if (!filePath) {
      const session = Array.from(this.sessions.values()).find((s) => s.id === sessionId);
      if (session) {
        filePath = session.filePath;
      }
    }
    if (!filePath) {
      for (const root of this.getManagedSessionRoots()) {
        const candidate = path.join(root, `${sessionId}.jsonl`);
        if (fs.existsSync(candidate)) {
          filePath = candidate;
          break;
        }
        if (path.resolve(root) === path.resolve(this.getCodexSessionsDir())) {
          const match = collectJsonlFiles(root).find((file) =>
            path.basename(file).includes(sessionId),
          );
          if (match) {
            filePath = match;
            break;
          }
        }
      }
    }
    if (!filePath) {
      return [];
    }

    if (this.isCodexSessionFile(filePath)) {
      return this.loadCodexTranscriptMessages(filePath, sessionId);
    }

    const messages: Array<Record<string, unknown>> = [];

    try {
      const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (!line.trim()) {
          continue;
        }
        let entry: Record<string, unknown>;
        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }

        const type = entry.type as string | undefined;

        // Include user messages (skip meta/synthetic context injections)
        if (type === 'user' && !entry.isMeta) {
          messages.push(entry);
        }
        // Include assistant messages
        else if (type === 'assistant') {
          messages.push(entry);
        }
      }
    } catch (err) {
      console.error(`SessionTracker: failed to load messages for ${sessionId}:`, err);
    }

    return messages;
  }

  /** Update a session's title (called when ai-title arrives during active session). */
  updateSessionTitle(sessionId: string, newTitle: string): void {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.title = newTitle;
      this._onSessionsChanged.fire(this.getSessionList());
    }
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.watchers = [];
    this.sessions.clear();
  }
}
