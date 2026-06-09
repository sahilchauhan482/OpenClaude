export function useFrustrationDetection(..._args: unknown[]): {
  state: string
  handleTranscriptSelect: (..._innerArgs: unknown[]) => void
} {
  return {
    state: 'closed',
    handleTranscriptSelect: () => {},
  }
}
