export type ReviewerFindingSeverity = 'critical' | 'high' | 'medium' | 'low'

export type ParsedReviewerFinding = {
  severity: ReviewerFindingSeverity
  location?: string
  problem: string
  whyItMatters?: string
  evidence?: string
}

export type ParsedReviewerResult = {
  findings: ParsedReviewerFinding[]
  hasFindings: boolean
  openQuestions?: string[]
  residualRisks?: string[]
}

export function parseReviewerResult(text: string): ParsedReviewerResult | null {
  const findingsSection = text.match(
    /## Findings([\s\S]*?)(?:## Open Questions|## Residual Risk|$)/i,
  )
  if (!findingsSection?.[1]) {
    return null
  }

  const body = findingsSection[1].trim()
  if (!body) {
    return null
  }

  if (/No actionable findings\./i.test(body)) {
    return {
      findings: [],
      hasFindings: false,
      openQuestions: parseSectionList(text, 'Open Questions'),
      residualRisks: parseSectionList(text, 'Residual Risk'),
    }
  }

  const blocks = body
    .split(/\n(?=\d+\.\s+\[(?:critical|high|medium|low)\])/i)
    .map(item => item.trim())
    .filter(Boolean)

  const findings = blocks.flatMap(block => {
    const lines = block
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
    const header = lines[0]?.match(
      /^\d+\.\s+\[(critical|high|medium|low)\]\s*(.+)?$/i,
    )
    if (!header) {
      return []
    }

    const severity = header[1].toLowerCase() as ReviewerFindingSeverity
    const location = header[2]?.trim() || undefined
    const problem = extractPrefixedLine(lines, 'Problem:') ?? ''
    if (!problem) {
      return []
    }

    return [
      {
        severity,
        location,
        problem,
        whyItMatters: extractPrefixedLine(lines, 'Why it matters:'),
        evidence: extractPrefixedLine(lines, 'Evidence:'),
      },
    ]
  })

  return {
    findings,
    hasFindings: findings.length > 0,
    openQuestions: parseSectionList(text, 'Open Questions'),
    residualRisks: parseSectionList(text, 'Residual Risk'),
  }
}

function extractPrefixedLine(
  lines: string[],
  prefix: string,
): string | undefined {
  const line = lines.find(entry => entry.startsWith(prefix))
  return line ? line.slice(prefix.length).trim() : undefined
}

function parseSectionList(text: string, heading: string): string[] | undefined {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const section = text.match(
    new RegExp(
      `## ${escapedHeading}([\\s\\S]*?)(?:\\n## [^\\n]+|$)`,
      'i',
    ),
  )
  if (!section?.[1]) {
    return undefined
  }

  const items = section[1]
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^[-*]\s+/, ''))
    .filter(Boolean)

  return items.length > 0 ? items : undefined
}
