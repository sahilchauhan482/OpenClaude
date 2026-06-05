export type VerificationVerdict = 'PASS' | 'FAIL' | 'PARTIAL'

export type ParsedVerificationResult = {
  verdict: VerificationVerdict
  commandBlockCount: number
  checkCount: number
  hasEvidence: boolean
}

const VERDICT_PATTERN = /VERDICT:\s*(PASS|FAIL|PARTIAL)\b/
const CHECK_HEADING_PATTERN = /^### Check:/gm
const COMMAND_BLOCK_PATTERN = /^\*\*Command run:\*\*/gm

export function parseVerificationResult(
  text: string,
): ParsedVerificationResult | null {
  const verdictMatch = text.match(VERDICT_PATTERN)
  if (!verdictMatch?.[1]) {
    return null
  }

  const verdict = verdictMatch[1] as VerificationVerdict
  const checkCount = countMatches(text, CHECK_HEADING_PATTERN)
  const commandBlockCount = countMatches(text, COMMAND_BLOCK_PATTERN)

  return {
    verdict,
    checkCount,
    commandBlockCount,
    hasEvidence: checkCount > 0 && commandBlockCount >= checkCount,
  }
}

function countMatches(text: string, pattern: RegExp): number {
  return Array.from(text.matchAll(pattern)).length
}
