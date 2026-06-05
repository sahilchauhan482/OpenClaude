import type { RenderableBlock } from '../types/chat';
import type { ContentBlock, TextBlock } from '../types/messages';

const PROCEDURAL_CHATTER_PATTERN = /^(we need to|i(?:'ll| will))\s+(read|run|inspect|check|open|use|load|review)\b/i;
const INTERNAL_SKILL_PATH_PATTERN = /(?:^|\s|`|- )(skills\/.+\/SKILL\.md|agents\/.+\.md)\b/i;
const INTERNAL_SKILL_SECTION_PATTERN =
  /##\s+(Usage|Arguments|Deterministic Engine|Review Checklist|Links)\b/i;

function isToolContextBlock(block: { type: string }): boolean {
  return block.type === 'tool_use' || block.type === 'server_tool_use' || block.type === 'tool_result';
}

export function isInternalAssistantTextNoise(text: string, hasToolContext: boolean): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }

  if (INTERNAL_SKILL_PATH_PATTERN.test(trimmed) && INTERNAL_SKILL_SECTION_PATTERN.test(trimmed)) {
    return true;
  }

  if (hasToolContext && PROCEDURAL_CHATTER_PATTERN.test(trimmed)) {
    return true;
  }

  return false;
}

export function sanitizeAssistantContentBlocks(blocks: ContentBlock[]): ContentBlock[] {
  const hasToolContext = blocks.some(isToolContextBlock);
  return blocks.filter((block) => {
    if (block.type !== 'text') {
      return true;
    }

    return !isInternalAssistantTextNoise((block as TextBlock).text, hasToolContext);
  });
}

export function sanitizeAssistantRenderableBlocks(blocks: RenderableBlock[]): RenderableBlock[] {
  const hasToolContext = blocks.some(({ block }) => isToolContextBlock(block));
  return blocks.filter(({ block }) => {
    if (block.type !== 'text') {
      return true;
    }

    return !isInternalAssistantTextNoise((block as TextBlock).text, hasToolContext);
  });
}
