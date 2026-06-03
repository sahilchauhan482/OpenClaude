import { describe, it, expect } from 'vitest';
import { inferModelSupportsImages, resolveModelSupportsImages } from '../../webview/src/utils/modelCapabilities';

describe('inferModelSupportsImages', () => {
  it('treats Gemma multimodal models as image-capable', () => {
    expect(inferModelSupportsImages({
      value: 'gemma-4-31b-it',
      displayName: 'Google Gemini · gemma-4-31b-it',
    })).toBe(true);
  });

  it('respects explicit false flags', () => {
    expect(inferModelSupportsImages({
      value: 'gemma-4-31b-it',
      displayName: 'Google Gemini · gemma-4-31b-it',
      supportsImages: false,
    })).toBe(false);
  });

  it('keeps text-only models false', () => {
    expect(inferModelSupportsImages({
      value: 'gpt-4.1-nano',
      displayName: 'GPT-4.1 Nano',
      supportsImages: false,
      modalities: ['text'],
    })).toBe(false);
  });

  it('lets model names override stale false metadata when the model is clearly multimodal', () => {
    expect(resolveModelSupportsImages({
      value: 'gemma-4-31b-it',
      displayName: 'Google Gemini · gemma-4-31b-it',
      supportsImages: false,
    })).toBe(true);
  });
  it('treats classification metadata as authoritative for vision-capable models', () => {
    expect(resolveModelSupportsImages({
      value: 'phi-4-multimodal-instruct',
      displayName: 'Phi 4 Multimodal',
      classification: ['chat', 'vision'],
      supportsImages: false,
    })).toBe(true);
  });

  it('respects nested capability flags from provider catalogs', () => {
    expect(resolveModelSupportsImages({
      value: 'meta/llama-3.2-90b-vision-instruct',
      displayName: 'Llama 3.2 90B Vision',
      capabilities: {
        supportsVision: true,
      },
    })).toBe(true);
  });
});
