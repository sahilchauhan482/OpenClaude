import {
  getToolPresentation,
  parseReviewerToolResult,
  parseVerificationToolResult,
} from '../../webview/src/utils/toolPresentation';

export interface ToolPlaybackFixture {
  toolName: string;
  presentationKind: 'command' | 'file' | 'search' | 'web' | 'generic';
  summary: string;
  language?: string;
  code?: string;
  verification?: ReturnType<typeof parseVerificationToolResult>;
  reviewer?: ReturnType<typeof parseReviewerToolResult>;
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
