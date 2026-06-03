export interface ProviderStateLike {
  currentModel?: unknown;
}

export function getProviderStateModel(state: ProviderStateLike): string | null {
  if (typeof state.currentModel !== 'string') return null;
  const trimmed = state.currentModel.trim();
  return trimmed ? trimmed : null;
}
