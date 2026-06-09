export class SSHSessionError extends Error {}

export type SSHSession = {
  remoteCwd: string
  [key: string]: unknown
}

export async function createSSHSession(
  config: { cwd?: string } & Record<string, unknown>,
  _options?: Record<string, unknown>,
): Promise<SSHSession> {
  return {
    remoteCwd: typeof config.cwd === 'string' ? config.cwd : process.cwd(),
  }
}

export function createLocalSSHSession(
  config: { cwd?: string } & Record<string, unknown>,
): SSHSession {
  return {
    remoteCwd: typeof config.cwd === 'string' ? config.cwd : process.cwd(),
  }
}
