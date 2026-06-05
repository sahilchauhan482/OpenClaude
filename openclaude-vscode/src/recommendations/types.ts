import type { PluginScope } from '../plugins/types';

export type CapabilityRecommendationKind = 'plugin' | 'mcp';

export type CapabilityRecommendationAction =
  | {
      kind: 'plugin_install';
      pluginName: string;
      scope: PluginScope;
    }
  | {
      kind: 'plugin_manager';
      pluginName?: string;
      marketplace?: string;
    }
  | {
      kind: 'mcp_add';
      serverName: string;
      config: Record<string, unknown>;
    }
  | {
      kind: 'mcp_manager';
      serverName?: string;
    }
  | {
      kind: 'plugin_uninstall';
      pluginName: string;
    }
  | {
      kind: 'mcp_disable';
      serverName: string;
    };

export interface CapabilityRecommendation {
  id: string;
  kind: CapabilityRecommendationKind;
  title: string;
  capabilityLabel: string;
  rationale: string;
  reasonDetail: string;
  recommendedActionLabel: string;
  recommendedAction: CapabilityRecommendationAction;
  secondaryActionLabel?: string;
  secondaryAction?: CapabilityRecommendationAction;
  keywords: string[];
  category?: 'task' | 'cleanup';
}

export interface RecommendationSessionState {
  shownIds: Set<string>;
  dismissedIds: Set<string>;
  appliedIds: Set<string>;
}

export interface CapabilityEnvironmentState {
  installedPlugins: string[];
  enabledPlugins: string[];
  mcpServers: Array<{
    name: string;
    status?: string;
    toolNames?: string[];
  }>;
}
