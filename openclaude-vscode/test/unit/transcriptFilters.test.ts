import { describe, expect, it } from 'vitest';
import {
  isInternalAssistantTextNoise,
  sanitizeAssistantContentBlocks,
  sanitizeAssistantRenderableBlocks,
} from '../../webview/src/utils/transcriptFilters';

describe('transcriptFilters', () => {
  it('suppresses procedural chatter when a tool card already shows the action', () => {
    expect(
      sanitizeAssistantContentBlocks([
        { type: 'text', text: 'We need to read openclaude-cli/package.json.' },
        { type: 'tool_use', id: 'tool-1', name: 'READ', input: { file_path: 'openclaude-cli/package.json' } },
      ]),
    ).toEqual([
      { type: 'tool_use', id: 'tool-1', name: 'READ', input: { file_path: 'openclaude-cli/package.json' } },
    ]);
  });

  it('suppresses raw skill instructions from the visible transcript', () => {
    expect(
      isInternalAssistantTextNoise(
        [
          '- Skill: `skills/security-scan/SKILL.md`',
          '## Usage',
          '/security-scan [path]',
        ].join('\n'),
        true,
      ),
    ).toBe(true);
  });

  it('preserves normal assistant summaries', () => {
    expect(
      sanitizeAssistantRenderableBlocks([
        {
          index: 0,
          isStreaming: false,
          block: { type: 'text', text: 'I checked the config and found the issue in tsconfig.' },
        },
      ]),
    ).toEqual([
      {
        index: 0,
        isStreaming: false,
        block: { type: 'text', text: 'I checked the config and found the issue in tsconfig.' },
      },
    ]);
  });
});
