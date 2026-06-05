import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { StructuredObservabilityEvent } from './eventLog';

function sanitizeSessionKey(sessionId: string | null): string {
  if (!sessionId) {
    return 'pending';
  }
  return sessionId.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

export class ObservabilityEventStore {
  private static readonly MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

  constructor(private readonly rootDir: string) {}

  private getSessionLogPath(sessionId: string | null): string {
    return path.join(this.rootDir, `${sanitizeSessionKey(sessionId)}.jsonl`);
  }

  async ensureReady(): Promise<void> {
    await fs.mkdir(this.rootDir, { recursive: true });
  }

  async append(event: StructuredObservabilityEvent): Promise<void> {
    await this.ensureReady();
    const logPath = this.getSessionLogPath(event.sessionId);
    await this.rotateIfNeeded(logPath);
    await fs.appendFile(logPath, `${JSON.stringify(event)}\n`, 'utf-8');
  }

  private async rotateIfNeeded(logPath: string): Promise<void> {
    try {
      const stat = await fs.stat(logPath);
      if (stat.size < ObservabilityEventStore.MAX_LOG_SIZE_BYTES) {
        return;
      }

      const content = await fs.readFile(logPath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      // Keep the most recent half of events
      const keepFrom = Math.floor(lines.length / 2);
      await fs.writeFile(logPath, lines.slice(keepFrom).join('\n') + '\n', 'utf-8');
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        // Silently ignore rotation failures — appending will still work
      }
    }
  }

  async readSessionEvents(sessionId: string | null): Promise<StructuredObservabilityEvent[]> {
    await this.ensureReady();
    const logPath = this.getSessionLogPath(sessionId);
    try {
      const content = await fs.readFile(logPath, 'utf-8');
      return content
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as StructuredObservabilityEvent);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async clearSession(sessionId: string | null): Promise<void> {
    await this.ensureReady();
    const logPath = this.getSessionLogPath(sessionId);
    try {
      await fs.rm(logPath, { force: true });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async rebindSession(fromSessionId: string | null, toSessionId: string): Promise<void> {
    if (fromSessionId === toSessionId) {
      return;
    }

    const fromEvents = await this.readSessionEvents(fromSessionId);
    if (fromEvents.length === 0) {
      return;
    }

    await this.clearSession(fromSessionId);
    for (const event of fromEvents) {
      await this.append({
        ...event,
        sessionId: toSessionId,
      });
    }
  }
}
