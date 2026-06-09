export type AssistantSession = {
  id: string
  title?: string
  cwd?: string
  updatedAt?: string
  [key: string]: unknown
}

export async function discoverAssistantSessions(): Promise<AssistantSession[]> {
  return []
}
