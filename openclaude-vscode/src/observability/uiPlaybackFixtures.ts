export interface ToolPlaybackFixture {
  toolName: string;
  presentationKind: 'command' | 'file' | 'search' | 'web' | 'generic';
  summary: string;
  language?: string;
  code?: string;
  verification?: VerificationToolResultSummary | null;
  reviewer?: ReviewerToolResultSummary | null;
}

interface VerificationToolResultSummary {
  verdict: 'PASS' | 'FAIL' | 'PARTIAL';
  checkCount: number;
  commandBlockCount: number;
  hasEvidence: boolean;
}

interface ReviewerFindingSummary {
  severity: 'critical' | 'high' | 'medium' | 'low';
  location?: string;
  problem: string;
  whyItMatters?: string;
  evidence?: string;
}

interface ReviewerToolResultSummary {
  findings: ReviewerFindingSummary[];
  hasFindings: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function summarizeToolResult(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((block) => {
      if (!isObject(block)) return '';
      if (typeof block.text === 'string') return block.text;
      if (typeof block.content === 'string') return block.content;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function firstString(input: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function getToolPresentation(toolName: string, input: Record<string, unknown>): {
  kind: ToolPlaybackFixture['presentationKind'];
  summary: string;
  language?: string;
  code?: string;
} {
  const normalized = toolName.toLowerCase();
  const command = firstString(input, ['command', 'cmd', 'script']);
  const filePath = firstString(input, ['file_path', 'path', 'file', 'filename', 'target_path']);
  const query = firstString(input, ['pattern', 'query', 'regex', 'glob']);

  if (['bash', 'terminal', 'execute', 'command', 'shell'].some((pattern) => normalized.includes(pattern))) {
    return {
      kind: 'command',
      summary: command ? command.replace(/\s+/g, ' ').trim().slice(0, 96) : 'Running command',
      language: 'bash',
      code: command,
    };
  }

  if (['write', 'edit', 'multiedit', 'fileedittool', 'filewritetool'].includes(normalized)) {
    const fileName = filePath?.replace(/\\/g, '/').split('/').pop();
    return {
      kind: 'file',
      summary: fileName ? `Editing ${fileName}` : 'Editing file',
      language: fileName?.split('.').pop(),
      code: typeof input.content === 'string' ? input.content : undefined,
    };
  }

  if (['search', 'grep', 'glob', 'find', 'ripgrep'].some((pattern) => normalized.includes(pattern))) {
    return { kind: 'search', summary: query ?? 'Searching', language: 'text', code: query };
  }

  if (['web', 'browser', 'fetch', 'http'].some((pattern) => normalized.includes(pattern))) {
    return { kind: 'web', summary: firstString(input, ['url', 'query', 'prompt']) ?? 'Fetching web content' };
  }

  return { kind: 'generic', summary: Object.keys(input).length > 0 ? 'Inspect tool input' : 'No input' };
}

function parseVerificationToolResult(content: string): VerificationToolResultSummary | null {
  const verdictMatch = content.match(/VERDICT:\s*(PASS|FAIL|PARTIAL)\b/);
  if (!verdictMatch?.[1]) {
    return null;
  }

  const checkCount = Array.from(content.matchAll(/^### Check:/gm)).length;
  const commandBlockCount = Array.from(content.matchAll(/^\*\*Command run:\*\*/gm)).length;
  return {
    verdict: verdictMatch[1] as VerificationToolResultSummary['verdict'],
    checkCount,
    commandBlockCount,
    hasEvidence: checkCount > 0 && commandBlockCount >= checkCount,
  };
}

function extractPrefixedLine(lines: string[], prefix: string): string | undefined {
  const line = lines.find((entry) => entry.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : undefined;
}

function parseReviewerToolResult(content: string): ReviewerToolResultSummary | null {
  const findingsSection = content.match(/## Findings([\s\S]*?)(?:## Open Questions|## Residual Risk|$)/i);
  if (!findingsSection?.[1]) {
    return null;
  }

  const body = findingsSection[1].trim();
  if (!body) {
    return null;
  }

  if (/No actionable findings\./i.test(body)) {
    return { findings: [], hasFindings: false };
  }

  const findings = body
    .split(/\n(?=\d+\.\s+\[(?:critical|high|medium|low)\])/i)
    .flatMap((block) => {
      const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const header = lines[0]?.match(/^\d+\.\s+\[(critical|high|medium|low)\]\s*(.+)?$/i);
      const problem = extractPrefixedLine(lines, 'Problem:');
      if (!header || !problem) {
        return [];
      }
      return [{
        severity: header[1].toLowerCase() as ReviewerFindingSummary['severity'],
        location: header[2]?.trim() || undefined,
        problem,
        whyItMatters: extractPrefixedLine(lines, 'Why it matters:'),
        evidence: extractPrefixedLine(lines, 'Evidence:'),
      }];
    });

  return { findings, hasFindings: findings.length > 0 };
}

export function buildToolPlaybackFixtures(
  transcriptMessages: Array<Record<string, unknown>>,
): ToolPlaybackFixture[] {
  const fixtures: ToolPlaybackFixture[] = [];

  for (const message of transcriptMessages) {
    if (message.type !== 'assistant') {
      continue;
    }

    const rawMessage = isObject(message.message) ? message.message : undefined;
    const content = Array.isArray(rawMessage?.content) ? rawMessage.content : [];

    for (let index = 0; index < content.length; index += 1) {
      const block = content[index];
      if (!isObject(block)) {
        continue;
      }

      const blockType = typeof block.type === 'string' ? block.type : '';
      if (blockType !== 'tool_use' && blockType !== 'server_tool_use') {
        continue;
      }

      const toolName = typeof block.name === 'string' ? block.name : 'tool';
      const toolInput = isObject(block.input) ? block.input : {};
      const presentation = getToolPresentation(toolName, toolInput);

      let toolResultSummary = '';
      for (let cursor = index + 1; cursor < content.length; cursor += 1) {
        const candidate = content[cursor];
        if (!isObject(candidate) || candidate.type !== 'tool_result') {
          continue;
        }
        if (candidate.tool_use_id === block.id) {
          toolResultSummary = summarizeToolResult(candidate.content);
          break;
        }
      }

      fixtures.push({
        toolName,
        presentationKind: presentation.kind,
        summary: presentation.summary,
        language: presentation.language,
        code: presentation.code,
        verification: toolResultSummary ? parseVerificationToolResult(toolResultSummary) : null,
        reviewer: toolResultSummary ? parseReviewerToolResult(toolResultSummary) : null,
      });
    }
  }

  return fixtures;
}
