import { describe, expect, it } from 'vitest';
import { findCapabilityRecommendation } from '../../src/recommendations/recommendationEngine';
import { createRecommendationSessionState } from '../../src/recommendations/state';

describe('recommendationEngine', () => {
  it('recommends postgres MCP when DB intent is present and capability is missing', () => {
    const recommendation = findCapabilityRecommendation(
      'Please inspect the Postgres schema and run a SQL query on the database',
      {
        installedPlugins: [],
        enabledPlugins: [],
        mcpServers: [],
      },
      createRecommendationSessionState(),
    );

    expect(recommendation?.id).toBe('postgres-mcp');
    expect(recommendation?.kind).toBe('mcp');
  });

  it('does not recommend an already-available capability', () => {
    const recommendation = findCapabilityRecommendation(
      'Run an end to end browser screenshot flow with playwright',
      {
        installedPlugins: [],
        enabledPlugins: [],
        mcpServers: [{ name: 'playwright', status: 'connected', toolNames: ['browser_navigate'] }],
      },
      createRecommendationSessionState(),
    );

    expect(recommendation).toBeNull();
  });

  it('respects session-scoped dismiss state', () => {
    const state = createRecommendationSessionState();
    state.dismissedIds.add('lsp-plugin');

    const recommendation = findCapabilityRecommendation(
      'Find symbol references and go to definition for this TypeScript rename',
      {
        installedPlugins: [],
        enabledPlugins: [],
        mcpServers: [],
      },
      state,
    );

    expect(recommendation).toBeNull();
  });

  it('does not repeat a recommendation once it has already been shown this session', () => {
    const state = createRecommendationSessionState();
    state.shownIds.add('postgres-mcp');

    const recommendation = findCapabilityRecommendation(
      'Need a postgres migration query for this database issue',
      {
        installedPlugins: [],
        enabledPlugins: [],
        mcpServers: [],
      },
      state,
    );

    expect(recommendation).toBeNull();
  });

  it('suggests cleanup when a disabled browser server lingers without a task-intent recommendation', () => {
    const recommendation = findCapabilityRecommendation(
      'help me continue this refactor',
      {
        installedPlugins: [],
        enabledPlugins: [],
        mcpServers: [{ name: 'playwright', status: 'disabled', toolNames: [] }],
      },
      createRecommendationSessionState(),
    );

    expect(recommendation?.id).toBe('cleanup-disabled-playwright');
    expect(recommendation?.category).toBe('cleanup');
  });
});
