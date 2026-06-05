import type { RecommendationSessionState } from './types';

export function createRecommendationSessionState(): RecommendationSessionState {
  return {
    shownIds: new Set<string>(),
    dismissedIds: new Set<string>(),
    appliedIds: new Set<string>(),
  };
}
