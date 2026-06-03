import * as vscode from 'vscode';

export interface BlackboxSessionMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface BlackboxSessionInfo {
  id: string;
  providerId: 'blackbox';
  title: string;
  model: string;
  createdAt: string;
  timestamp: string;
  messageCount: number;
  cwd: string;
  gitBranch: string;
  messages: BlackboxSessionMessage[];
}

export type BlackboxSessionGroup = 'Today' | 'Yesterday' | 'This Week' | 'This Month' | 'Older';

export interface GroupedBlackboxSessions {
  group: BlackboxSessionGroup;
  sessions: Array<{
    id: string;
    title: string;
    model: string;
    timestamp: string;
    createdAt: string;
    messageCount: number;
    cwd: string;
    gitBranch: string;
    providerId: 'blackbox';
  }>;
}

const STORAGE_KEY = 'openclaude.blackbox.sessions.v1';

export class BlackboxSessionStore {
  private sessions = new Map<string, BlackboxSessionInfo>();

  constructor(private readonly context: vscode.ExtensionContext) {
    const stored = context.workspaceState.get<BlackboxSessionInfo[]>(STORAGE_KEY, []);
    for (const session of stored) {
      this.sessions.set(session.id, session);
    }
  }

  getSession(id: string): BlackboxSessionInfo | undefined {
    return this.sessions.get(id);
  }

  getSessionList(): BlackboxSessionInfo[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  getGroupedSessions(): GroupedBlackboxSessions[] {
    const sessions = this.getSessionList();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
    const weekStart = new Date(todayStart.getTime() - 7 * 86_400_000);
    const monthStart = new Date(todayStart.getTime() - 30 * 86_400_000);

    const buckets: Record<BlackboxSessionGroup, GroupedBlackboxSessions['sessions']> = {
      Today: [],
      Yesterday: [],
      'This Week': [],
      'This Month': [],
      Older: [],
    };

    for (const session of sessions) {
      const t = new Date(session.timestamp).getTime();
      const summary = {
        id: session.id,
        title: session.title,
        model: session.model,
        timestamp: session.timestamp,
        createdAt: session.createdAt,
        messageCount: session.messageCount,
        cwd: session.cwd,
        gitBranch: session.gitBranch,
        providerId: 'blackbox' as const,
      };
      if (t >= todayStart.getTime()) {
        buckets.Today.push(summary);
      } else if (t >= yesterdayStart.getTime()) {
        buckets.Yesterday.push(summary);
      } else if (t >= weekStart.getTime()) {
        buckets['This Week'].push(summary);
      } else if (t >= monthStart.getTime()) {
        buckets['This Month'].push(summary);
      } else {
        buckets.Older.push(summary);
      }
    }

    return (['Today', 'Yesterday', 'This Week', 'This Month', 'Older'] as const)
      .filter((group) => buckets[group].length > 0)
      .map((group) => ({ group, sessions: buckets[group] }));
  }

  startSession(sessionId: string, model: string, title?: string): BlackboxSessionInfo {
    const now = new Date().toISOString();
    const session: BlackboxSessionInfo = {
      id: sessionId,
      providerId: 'blackbox',
      title: title?.trim() || 'Untitled Session',
      model,
      createdAt: now,
      timestamp: now,
      messageCount: 0,
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd(),
      gitBranch: '',
      messages: [],
    };
    this.sessions.set(sessionId, session);
    this.persist();
    return session;
  }

  appendUserMessage(sessionId: string, content: string, model: string): BlackboxSessionInfo {
    const session = this.sessions.get(sessionId) ?? this.startSession(sessionId, model, content.slice(0, 120));
    session.model = model;
    session.title = session.title === 'Untitled Session' && content.trim()
      ? content.slice(0, 120)
      : session.title;
    session.timestamp = new Date().toISOString();
    session.messageCount += 1;
    session.messages.push({ role: 'user', content, timestamp: session.timestamp });
    this.sessions.set(sessionId, session);
    this.persist();
    return session;
  }

  appendAssistantMessage(sessionId: string, content: string): BlackboxSessionInfo | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    session.timestamp = new Date().toISOString();
    session.messageCount += 1;
    session.messages.push({ role: 'assistant', content, timestamp: session.timestamp });
    this.sessions.set(sessionId, session);
    this.persist();
    return session;
  }

  loadSessionMessages(sessionId: string): Array<Record<string, unknown>> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return session.messages.map((message, index) => {
      if (message.role === 'assistant') {
        return {
          type: 'assistant',
          uuid: `${sessionId}-assistant-${index}`,
          session_id: sessionId,
          parent_tool_use_id: null,
          message: {
            id: `${sessionId}-assistant-${index}`,
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: message.content }],
            model: session.model,
            stop_reason: null,
            usage: {
              input_tokens: 0,
              output_tokens: 0,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
          },
        };
      }

      return {
        type: 'user',
        uuid: `${sessionId}-user-${index}`,
        session_id: sessionId,
        parent_tool_use_id: null,
        message: {
          role: 'user',
          content: message.content,
        },
      };
    });
  }

  deleteSession(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) this.persist();
    return deleted;
  }

  private persist(): void {
    void this.context.workspaceState.update(STORAGE_KEY, this.getSessionList());
  }
}
