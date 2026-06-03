import { describe, it, expect, vi } from 'vitest';
import { buildPromptContent, resolveAttachmentForPrompt } from '../../src/attachments/promptAttachments';

describe('buildPromptContent', () => {
  it('builds image content blocks for vision-capable models', async () => {
    const resolveAttachment = vi.fn().mockResolvedValue({
      type: 'image' as const,
      name: 'screenshot.png',
      mediaType: 'image/png',
      dataUrl: 'data:image/png;base64,AAAA',
    });

    const result = await buildPromptContent(
      'Please review this UI',
      [{ type: 'image', name: 'screenshot.png', content: 'C:\\shots\\screenshot.png' }],
      {
        supportsImages: true,
        resolveAttachment,
      },
    );

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: 'text', text: 'Please review this UI' });
    expect(result[1]).toEqual({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: 'AAAA',
      },
    });
  });

  it('skips OCR for vision-capable images when the attachment resolver is configured that way', async () => {
    const ocrRunner = vi.fn(async () => 'should not run');
    const result = await resolveAttachmentForPrompt(
      {
        type: 'image',
        name: 'screenshot.png',
        content: 'data:image/png;base64,AAAA',
      },
      {
        skipOcr: true,
        ocrRunner,
      },
    );

    expect(result.type).toBe('image');
    expect(result.dataUrl).toBe('data:image/png;base64,AAAA');
    expect(result.text).toBeUndefined();
    expect(ocrRunner).not.toHaveBeenCalled();
  });

  it('builds a structured text fallback for non-vision models', async () => {
    const resolveAttachment = vi.fn().mockResolvedValue({
      type: 'image' as const,
      name: 'screenshot.png',
      mediaType: 'image/png',
      dataUrl: 'data:image/png;base64,AAAA',
      text: 'Button label: Save\nModal title: Settings',
    });

    const result = await buildPromptContent(
      'Please review this UI',
      [{ type: 'image', name: 'screenshot.png', content: 'C:\\shots\\screenshot.png' }],
      {
        supportsImages: false,
        resolveAttachment,
      },
    );

    expect(typeof result).toBe('string');
    expect(result).toContain('Please review this UI');
    expect(result).toContain('Attached image: screenshot.png');
    expect(result).toContain('Button label: Save');
    expect(result).toContain('Modal title: Settings');
  });

  it('uses the best OCR pass for screenshots', async () => {
    const ocrRunner = vi.fn(async (_source: string, psm: string) => {
      if (psm === '11') return '';
      if (psm === '6') return 'Hello   world\n\nSave button';
      return 'Hello world';
    });

    const result = await resolveAttachmentForPrompt(
      {
        type: 'image',
        name: 'screenshot.png',
        content: 'data:image/png;base64,AAAA',
      },
      {
        ocrRunner,
      },
    );

    expect(result.type).toBe('image');
    expect(result.text).toBe('Hello world\n\nSave button');
    expect(ocrRunner).toHaveBeenCalledTimes(2);
  });

  it('stops early when the first OCR pass is already good enough', async () => {
    const ocrRunner = vi.fn(async (_source: string, psm: string) => {
      if (psm === '11') return 'Create account\nSign in\nPassword';
      return 'fallback should not be used';
    });

    const result = await resolveAttachmentForPrompt(
      {
        type: 'image',
        name: 'screenshot.png',
        content: 'data:image/png;base64,AAAA',
      },
      {
        ocrRunner,
      },
    );

    expect(result.type).toBe('image');
    expect(result.text).toBe('Create account\nSign in\nPassword');
    expect(ocrRunner).toHaveBeenCalledTimes(1);
  });

  it('prefers an injected OCR text resolver when available', async () => {
    const ocrImageText = vi.fn(async () => '  Hello\n\n  world  ');
    const ocrRunner = vi.fn(async () => 'should not run');

    const result = await resolveAttachmentForPrompt(
      {
        type: 'image',
        name: 'screenshot.png',
        content: 'data:image/png;base64,AAAA',
      },
      {
        ocrImageText,
        ocrRunner,
      },
    );

    expect(result.type).toBe('image');
    expect(result.text).toBe('Hello\n\nworld');
    expect(ocrImageText).toHaveBeenCalledTimes(1);
    expect(ocrRunner).not.toHaveBeenCalled();
  });
});
