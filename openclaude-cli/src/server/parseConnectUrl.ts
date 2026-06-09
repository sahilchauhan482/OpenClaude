export function parseConnectUrl(url: string): {
  serverUrl: string
  authToken: string
} {
  return {
    serverUrl: url,
    authToken: '',
  }
}
