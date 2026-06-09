import type { CommandResultDisplay } from '../../commands.js'

export type PluginSettingsProps = {
  onComplete: (result?: string, options?: { display?: CommandResultDisplay }) => void
  args?: string
  showMcpRedirectMessage?: boolean
}

export type ManagePluginAction = 'enable' | 'disable' | 'uninstall'
export type ManageMarketplaceAction = 'remove' | 'update'

export type ViewState =
  | { type: 'menu' }
  | { type: 'help' }
  | { type: 'validate'; path?: string }
  | { type: 'discover-plugins'; targetPlugin?: string }
  | {
      type: 'browse-marketplace'
      targetMarketplace?: string
      targetPlugin?: string
    }
  | {
      type: 'manage-plugins'
      targetPlugin?: string
      targetMarketplace?: string
      action?: ManagePluginAction
    }
  | {
      type: 'manage-marketplaces'
      targetMarketplace?: string
      action?: ManageMarketplaceAction
    }
  | { type: 'add-marketplace'; initialValue?: string }
  | { type: 'marketplace-list' }
  | { type: 'marketplace-menu' }
