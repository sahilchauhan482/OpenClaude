import { describe, expect, it } from 'vitest';
import { createRecommendationSessionState } from '../../src/recommendations/state';

describe('recommendation session state', () => {
  it('tracks shown, dismissed, and applied recommendations separately', () => {
    const state = createRecommendationSessionState();

    state.shownIds.add('postgres-mcp');
    state.dismissedIds.add('playwright-mcp');
    state.appliedIds.add('lsp-plugin');

    expect(Array.from(state.shownIds)).toEqual(['postgres-mcp']);
    expect(Array.from(state.dismissedIds)).toEqual(['playwright-mcp']);
    expect(Array.from(state.appliedIds)).toEqual(['lsp-plugin']);
  });
});
