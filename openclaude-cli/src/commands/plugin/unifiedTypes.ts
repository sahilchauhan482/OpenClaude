import type { MCPServerConnection } from '../../services/mcp/types.js'
import type { PluginError, LoadedPlugin } from '../../types/plugin.js'

export type PluginScope =
  | 'user'
  | 'project'
  | 'local'
  | 'managed'
  | 'builtin'
  | 'enterprise'
  | 'dynamic'
  | 'flagged'

export type UnifiedInstalledPluginItem = {
  type: 'plugin'
  id: string
  name: string
  description?: string
  marketplace: string
  scope: PluginScope
  isEnabled: boolean
  errorCount: number
  errors: PluginError[]
  plugin: LoadedPlugin
  pendingEnable?: boolean
  pendingUpdate?: boolean
  pendingToggle?: 'will-enable' | 'will-disable'
}

export type UnifiedInstalledFlaggedPluginItem = {
  type: 'flagged-plugin'
  id: string
  name: string
  marketplace: string
  scope: 'flagged'
  reason: string
  text: string
  flaggedAt: string
}

export type UnifiedInstalledFailedPluginItem = {
  type: 'failed-plugin'
  id: string
  name: string
  marketplace: string
  scope: Exclude<PluginScope, 'flagged'>
  errorCount: number
  errors: PluginError[]
}

export type UnifiedInstalledMcpItem = {
  type: 'mcp'
  id: string
  name: string
  description?: string
  scope: Exclude<PluginScope, 'flagged' | 'builtin'>
  status: MCPServerConnection['type']
  client: MCPServerConnection
  indented?: boolean
}

export type UnifiedInstalledItem =
  | UnifiedInstalledPluginItem
  | UnifiedInstalledFlaggedPluginItem
  | UnifiedInstalledFailedPluginItem
  | UnifiedInstalledMcpItem
