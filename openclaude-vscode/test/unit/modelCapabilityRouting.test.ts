import { describe, expect, it } from 'vitest';
import {
  findModelDescriptor,
  resolveModelSupportsImagesForSelection,
} from '../../src/utils/modelCapabilities';

describe('model capability routing', () => {
  const catalog = [
    {
      value: 'gpt-4.1',
      displayName: 'GPT-4.1',
      capabilities: { supportsVision: true },
    },
    {
      value: 'gpt-4.1-nano',
      displayName: 'GPT-4.1 Nano',
      supportsVision: false,
      modalities: ['text'],
    },
    {
      value: 'meta/llama-3.2-90b-vision-instruct',
      displayName: 'Llama 3.2 90B Vision',
      classification: ['chat', 'vision'],
    },
  ];

  it('finds models by their exact selected value', () => {
    expect(findModelDescriptor(catalog, 'gpt-4.1')?.displayName).toBe('GPT-4.1');
  });

  it('uses catalog metadata for supported multimodal models', () => {
    expect(resolveModelSupportsImagesForSelection('gpt-4.1', catalog)).toBe(true);
    expect(
      resolveModelSupportsImagesForSelection(
        'meta/llama-3.2-90b-vision-instruct',
        catalog,
      ),
    ).toBe(true);
  });

  it('keeps text-only catalog entries on the OCR path', () => {
    expect(resolveModelSupportsImagesForSelection('gpt-4.1-nano', catalog)).toBe(false);
  });

  it('falls back to model-name heuristics for uncatalogued but clearly vision models', () => {
    expect(resolveModelSupportsImagesForSelection('phi-4-multimodal-instruct', [])).toBe(true);
  });
});
