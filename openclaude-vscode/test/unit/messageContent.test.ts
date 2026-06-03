import { describe, it, expect } from 'vitest';
import { describeUserMessageContent } from '../../webview/src/utils/messageContent';

describe('describeUserMessageContent', () => {
  it('returns a readable summary for empty non-text content', () => {
    expect(describeUserMessageContent([])).toBe('[empty message]');
  });

  it('summarizes attachments instead of a generic placeholder', () => {
    const summary = describeUserMessageContent([
      { type: 'image' },
      { type: 'image' },
      { type: 'tool_result' },
    ]);

    expect(summary).toBe('[2 images, 1 tool result]');
  });

  it('suppresses pure tool-result placeholder messages', () => {
    expect(describeUserMessageContent([{ type: 'tool_result' }])).toBe('');
  });

  it('keeps text while appending attachment metadata', () => {
    const summary = describeUserMessageContent([
      { type: 'text', text: 'hello there' },
      { type: 'image' },
    ]);

    expect(summary).toBe('hello there\n\n[1 image]');
  });
});
