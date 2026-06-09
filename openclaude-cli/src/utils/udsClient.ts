// Stub — udsClient not included in source snapshot
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function sendToUdsSocket(
  _socketPath: string,
  _message: string,
): Promise<any> {
  throw new Error('udsClient not available')
}
