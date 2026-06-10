export function deriveProgressNote(summary?: string, lastToolName?: string): string | undefined {
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
  if (normalized.includes('bash') || normalized.includes('command') || normalized.includes('terminal')) return 'Running a shell command';
  if (normalized.includes('edit') || normalized.includes('write')) return 'Applying file changes';
  if (normalized.includes('agent')) return 'Coordinating worker tasks';
  if (normalized.includes('web') || normalized.includes('fetch')) return 'Checking the web';
  if (normalized.includes('todowrite') || normalized.includes('plan')) return 'Updating work plan';
  return `Using ${lastToolName}`;
}

export function formatElapsedTime(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${Math.max(1, seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

export function formatTokenCount(count: number): string {
  if (count < 1000) return `${count}`;
  if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
  return `${Math.round(count / 1000)}k`;
}

export function isAgentToolName(toolName: string): boolean {
  const n = toolName.toLowerCase();
  return n === 'agent' || n.includes('agent') || n.includes('subagent');
}
