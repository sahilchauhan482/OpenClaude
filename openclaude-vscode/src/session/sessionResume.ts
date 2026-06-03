import type { SessionInfo } from './sessionTracker';
import { resolveNearestGitRepositoryPath } from '../context/workspaceContext';

export interface ResumeSessionCallbacks<TMessage = Record<string, unknown>> {
  prepare: () => void;
  loadHistory: () => Promise<TMessage[]>;
  spawn: () => Promise<void>;
}

export interface ResumeSessionContext {
  cwd: string;
  model?: string;
  provider?: string;
}

export interface ResumeSessionSource {
  cwd?: string;
  model?: string;
  provider?: string;
}

export interface RuntimeWorkspaceContext {
  workspacePath: string;
  gitRootPath: string;
  isGitRepository: boolean;
}

/**
 * Start the CLI resume path immediately, while history is still loading.
 * This keeps large sessions responsive by avoiding a full history parse
 * before the process can even boot.
 */
export function resumeSessionWithoutBlocking<TMessage = Record<string, unknown>>(
  callbacks: ResumeSessionCallbacks<TMessage>,
): Promise<{ historyPromise: Promise<TMessage[]> }> {
  callbacks.prepare();

  const historyPromise = callbacks.loadHistory();
  void callbacks.spawn();
  return Promise.resolve({ historyPromise });
}

/**
 * Resolve the runtime context for a resumed session.
 * The saved session cwd should win over the currently active workspace so
 * reopened chats continue from their original project directory.
 */
export function resolveResumeSessionContext(
  session: ResumeSessionSource | undefined,
  fallback: { cwd: string; model?: string },
): ResumeSessionContext {
  const sessionCwd = session?.cwd?.trim();
  const sessionModel = session?.model?.trim();
  const sessionProvider = session?.provider?.trim();

  return {
    cwd: sessionCwd || fallback.cwd,
    model: sessionModel && sessionModel !== 'unknown'
      ? sessionModel
      : fallback.model,
    provider: sessionProvider && sessionProvider !== 'unknown'
      ? sessionProvider
      : undefined,
  };
}

export function resolveResumeSessionContextFromInfo(
  session: SessionInfo | undefined,
  fallback: { cwd: string; model?: string },
): ResumeSessionContext {
  return resolveResumeSessionContext(session, fallback);
}

export function resolveResumeWorkspaceContext(
  session: ResumeSessionSource | undefined,
  fallback: { cwd: string; model?: string },
): RuntimeWorkspaceContext {
  const sessionContext = resolveResumeSessionContext(session, fallback);
  const gitRootPath = resolveNearestGitRepositoryPath(sessionContext.cwd) ?? sessionContext.cwd;

  return {
    workspacePath: sessionContext.cwd,
    gitRootPath,
    isGitRepository: Boolean(resolveNearestGitRepositoryPath(gitRootPath)),
  };
}

export function resolveResumeProvider(
  session: ResumeSessionSource | undefined,
  fallbackProvider: string,
): string {
  const sessionProvider = session?.provider?.trim();
  return sessionProvider && sessionProvider !== 'unknown'
    ? sessionProvider
    : fallbackProvider;
}

export function inferProviderFromModel(model: string | undefined): string | undefined {
  const normalized = model?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized.startsWith('gemma-') || normalized.startsWith('gemini-') || normalized.includes('gemini')) {
    return 'gemini';
  }

  if (
    normalized.startsWith('gpt-') ||
    normalized.startsWith('o1') ||
    normalized.startsWith('o3') ||
    normalized.includes('codex')
  ) {
    return 'codex';
  }

  if (
    normalized.includes('claude') ||
    normalized.includes('sonnet') ||
    normalized.includes('opus') ||
    normalized.includes('haiku')
  ) {
    return 'anthropic';
  }

  return undefined;
}
