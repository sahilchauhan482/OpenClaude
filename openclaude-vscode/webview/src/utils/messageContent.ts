function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

export function describeUserMessageContent(content: string | Array<Record<string, unknown>>): string {
  if (isString(content)) {
    const trimmed = content.trim();
    return trimmed || '[empty message]';
  }

  const textParts: string[] = [];
  let imageCount = 0;
  let documentCount = 0;
  let toolUseCount = 0;
  let toolResultCount = 0;
  let unknownCount = 0;

  for (const block of content) {
    switch (block.type) {
      case 'text':
        if (isString(block.text) && block.text.trim()) {
          textParts.push(block.text.trim());
        }
        break;
      case 'image':
        imageCount += 1;
        break;
      case 'document':
        documentCount += 1;
        break;
      case 'tool_use':
      case 'server_tool_use':
        toolUseCount += 1;
        break;
      case 'tool_result':
        toolResultCount += 1;
        break;
      default:
        unknownCount += 1;
        break;
    }
  }

  // Pure tool-result placeholder messages are already shown inline by the
  // tool result renderer, so keep them out of the user-message transcript.
  if (
    textParts.length === 0 &&
    imageCount === 0 &&
    documentCount === 0 &&
    toolUseCount === 0 &&
    unknownCount === 0 &&
    toolResultCount > 0
  ) {
    return '';
  }

  if (textParts.length > 0) {
    const summary = textParts.join('\n');
    const meta: string[] = [];
    if (imageCount > 0) meta.push(pluralize(imageCount, 'image'));
    if (documentCount > 0) meta.push(pluralize(documentCount, 'document'));
    if (toolUseCount > 0) meta.push(pluralize(toolUseCount, 'tool call'));
    if (toolResultCount > 0) meta.push(pluralize(toolResultCount, 'tool result'));
    if (unknownCount > 0) meta.push(pluralize(unknownCount, 'item'));
    return meta.length > 0 ? `${summary}\n\n[${meta.join(', ')}]` : summary;
  }

  const parts: string[] = [];
  if (imageCount > 0) parts.push(pluralize(imageCount, 'image'));
  if (documentCount > 0) parts.push(pluralize(documentCount, 'document'));
  if (toolUseCount > 0) parts.push(pluralize(toolUseCount, 'tool call'));
  if (toolResultCount > 0) parts.push(pluralize(toolResultCount, 'tool result'));
  if (unknownCount > 0) parts.push(pluralize(unknownCount, 'item'));

  return parts.length > 0 ? `[${parts.join(', ')}]` : '[empty message]';
}
