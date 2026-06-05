import * as fs from 'fs';
import * as path from 'path';

export function workspacePathToClaudeProjectDir(workspacePath: string): string {
  return workspacePath.replace(/[\\/]/g, '-').replace(/:/g, '-');
}

export function collectJsonlFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const results: string[] = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    let stats: fs.Stats;
    try {
      stats = fs.statSync(current);
    } catch {
      continue;
    }

    if (stats.isFile()) {
      if (current.toLowerCase().endsWith('.jsonl')) {
        results.push(current);
      }
      continue;
    }

    if (!stats.isDirectory()) {
      continue;
    }

    for (const entry of fs.readdirSync(current)) {
      stack.push(path.join(current, entry));
    }
  }

  return results.sort();
}

export function inferTranscriptSessionId(entry: Record<string, unknown>, fallback: string): string {
  if (typeof entry.sessionId === 'string' && entry.sessionId.trim()) {
    return entry.sessionId;
  }

  if (typeof entry.session_id === 'string' && entry.session_id.trim()) {
    return entry.session_id;
  }

  if (typeof entry.id === 'string' && entry.type === 'session_meta') {
    return entry.id;
  }

  const payload = entry.payload as Record<string, unknown> | undefined;
  if (payload) {
    if (
      entry.type === 'session_meta'
      && typeof payload.id === 'string'
      && payload.id.trim()
    ) {
      return payload.id;
    }
    if (typeof payload.sessionId === 'string' && payload.sessionId.trim()) {
      return payload.sessionId;
    }
  }

  return fallback;
}
