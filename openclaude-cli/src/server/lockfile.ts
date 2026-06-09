export async function writeServerLock(_lock: Record<string, unknown>): Promise<void> {}

export async function removeServerLock(): Promise<void> {}

export async function probeRunningServer(): Promise<{
  pid: number
  httpUrl: string
} | null> {
  return null
}
