import type { SystemTheme } from './systemTheme.js'

export function watchSystemTheme(
  _querier: unknown,
  _onChange: (theme: SystemTheme) => void,
): () => void {
  return () => {}
}

