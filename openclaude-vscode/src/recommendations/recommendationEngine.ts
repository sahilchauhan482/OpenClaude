import { CAPABILITY_RECOMMENDATIONS } from './capabilityRecommendations';
import type {
  CapabilityEnvironmentState,
  CapabilityRecommendation,
  RecommendationSessionState,
} from './types';

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function hasKeywordMatch(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function recommendationAlreadySatisfied(
  recommendation: CapabilityRecommendation,
  environment: CapabilityEnvironmentState,
): boolean {
  if (recommendation.kind === 'plugin') {
    const pluginAction =
      recommendation.recommendedAction.kind === 'plugin_install'
        ? recommendation.recommendedAction
        : recommendation.secondaryAction?.kind === 'plugin_install'
          ? recommendation.secondaryAction
          : undefined;
    if (!pluginAction) return false;
    const pluginName = pluginAction.pluginName.toLowerCase();
    return environment.enabledPlugins.some((name) => name.toLowerCase().includes(pluginName))
      || environment.installedPlugins.some((name) => name.toLowerCase().includes(pluginName));
  }

  const serverName =
    recommendation.recommendedAction.kind === 'mcp_add'
      ? recommendation.recommendedAction.serverName.toLowerCase()
      : recommendation.secondaryAction?.kind === 'mcp_add'
        ? recommendation.secondaryAction.serverName.toLowerCase()
        : recommendation.recommendedAction.kind === 'mcp_manager' && recommendation.recommendedAction.serverName
          ? recommendation.recommendedAction.serverName.toLowerCase()
          : undefined;
  if (!serverName) return false;

  return environment.mcpServers.some((server) => {
    const normalizedName = server.name.toLowerCase();
    if (normalizedName.includes(serverName)) return true;
    return (server.toolNames ?? []).some((tool) => tool.toLowerCase().includes(serverName));
  });
}

function findCleanupRecommendation(
  environment: CapabilityEnvironmentState,
  sessionState: RecommendationSessionState,
): CapabilityRecommendation | null {
  const hasDisabledPlaywright = environment.mcpServers.some(
    (server) => server.name.toLowerCase().includes('playwright') && server.status === 'disabled',
  );

  if (!hasDisabledPlaywright) {
    return null;
  }

  const recommendation = CAPABILITY_RECOMMENDATIONS.find((item) => item.id === 'cleanup-disabled-playwright') ?? null;
  if (!recommendation) {
    return null;
  }

  if (sessionState.dismissedIds.has(recommendation.id) || sessionState.appliedIds.has(recommendation.id) || sessionState.shownIds.has(recommendation.id)) {
    return null;
  }

  return recommendation;
}

export function findCapabilityRecommendation(
  promptText: string,
  environment: CapabilityEnvironmentState,
  sessionState: RecommendationSessionState,
): CapabilityRecommendation | null {
  const normalized = normalizeText(promptText);
  if (!normalized) return null;

  const MIN_KEYWORD_MATCHES = 2;

  const scored = CAPABILITY_RECOMMENDATIONS
    .map((recommendation) => {
      const matchCount = recommendation.keywords.filter((keyword) => normalized.includes(keyword)).length;
      return { recommendation, matchCount };
    })
    .filter(({ recommendation, matchCount }) => {
      const minRequired = recommendation.category === 'cleanup' ? 1 : MIN_KEYWORD_MATCHES;
      return matchCount >= minRequired;
    })
    .filter(({ recommendation }) => !recommendationAlreadySatisfied(recommendation, environment))
    .filter(({ recommendation }) => !sessionState.dismissedIds.has(recommendation.id))
    .filter(({ recommendation }) => !sessionState.appliedIds.has(recommendation.id))
    .sort((left, right) => right.matchCount - left.matchCount);

  const ranked = scored.map(({ recommendation }) => recommendation);

  const candidate = ranked[0] ?? null;
  if (candidate) {
    if (sessionState.shownIds.has(candidate.id)) {
      return null;
    }

    return candidate;
  }

  return findCleanupRecommendation(environment, sessionState);
}
