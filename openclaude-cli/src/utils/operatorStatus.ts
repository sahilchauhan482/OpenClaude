import { cwd } from 'node:process'

import { REVIEWER_AGENT_TYPE, VERIFICATION_AGENT_TYPE } from '../tools/AgentTool/constants.js'
import { getWorktreePathsPortable } from './getWorktreePathsPortable.js'
import { getSettingsWithAllErrors } from './settings/allErrors.js'
import { getProviderValidationError } from './providerValidation.js'
import { resolveEnabledHookPolicyPacks } from './hooks/hookPolicyPacks.js'
import { isAgentSwarmsEnabled } from './agentSwarmsEnabled.js'
import { loadSameRepoMessageLogs } from './sessionStorage.js'
import {
  getManagedFileSettingsPresence,
  getPolicySettingsOrigin,
  getSettingsWithSources,
} from './settings/settings.js'
import { getSettingSourceDisplayNameCapitalized } from './settings/constants.js'

export type OperatorStatusLevel = 'ok' | 'warning' | 'blocking'

export interface OperatorStatusSection {
  key: string
  title: string
  level: OperatorStatusLevel
  summary: string
  details: string[]
}

export interface OperatorStatusReport {
  level: OperatorStatusLevel
  generatedAt: string
  workspaceCwd: string
  sections: OperatorStatusSection[]
}

const LEVEL_RANK: Record<OperatorStatusLevel, number> = {
  ok: 0,
  warning: 1,
  blocking: 2,
}

export async function collectOperatorStatus(
  currentCwd: string = cwd(),
): Promise<OperatorStatusReport> {
  const sections = await Promise.all([
    collectSettingsSection(),
    collectProviderSection(),
    collectHooksSection(),
    collectSpecialistsSection(),
    collectAgentTeamsSection(),
    collectResumeSection(currentCwd),
  ])

  return {
    level: sections.reduce<OperatorStatusLevel>((current, section) => {
      return LEVEL_RANK[section.level] > LEVEL_RANK[current]
        ? section.level
        : current
    }, 'ok'),
    generatedAt: new Date().toISOString(),
    workspaceCwd: currentCwd,
    sections,
  }
}

function collectSettingsSection(): OperatorStatusSection {
  const { effective, sources } = getSettingsWithSources()
  const { errors } = getSettingsWithAllErrors()
  const settingsSourceNames = sources.map(({ source }) =>
    source === 'policySettings'
      ? describePolicySettingSource()
      : getSettingSourceDisplayNameCapitalized(source),
  )

  if (errors.length > 0) {
    const invalidFiles = Array.from(new Set(errors.map(error => error.file)))
    return {
      key: 'settings',
      title: 'Settings',
      level: 'warning',
      summary: `${errors.length} validation issue${errors.length === 1 ? '' : 's'} detected`,
      details: [
        `Active setting sources: ${settingsSourceNames.join(', ') || 'none'}`,
        `Invalid files: ${invalidFiles.join(', ')}`,
        `Merged settings keys: ${Object.keys(effective).length}`,
      ],
    }
  }

  return {
    key: 'settings',
    title: 'Settings',
    level: 'ok',
    summary: `Healthy across ${settingsSourceNames.length} active source${settingsSourceNames.length === 1 ? '' : 's'}`,
    details: [
      `Active setting sources: ${settingsSourceNames.join(', ') || 'none'}`,
      `Merged settings keys: ${Object.keys(effective).length}`,
    ],
  }
}

async function collectProviderSection(): Promise<OperatorStatusSection> {
  const validationError = await getProviderValidationError()
  if (validationError) {
    return {
      key: 'provider',
      title: 'Provider',
      level: 'blocking',
      summary: 'Provider configuration is blocking startup or reliable execution',
      details: [validationError],
    }
  }

  return {
    key: 'provider',
    title: 'Provider',
    level: 'ok',
    summary: 'Provider configuration passed validation',
    details: ['No blocking provider credential or routing issues were detected.'],
  }
}

function collectHooksSection(): OperatorStatusSection {
  const { effective, sources } = getSettingsWithSources()
  const policySettings = sources.find(
    source => source.source === 'policySettings',
  )?.settings
  const enabledPacks = resolveEnabledHookPolicyPacks(effective)
  const disableAllHooks = effective.disableAllHooks === true
  const allowManagedHooksOnly = policySettings?.allowManagedHooksOnly === true
  const strictPluginOnly = Array.isArray(effective.strictPluginOnlyCustomization)
    ? effective.strictPluginOnlyCustomization.includes('hooks')
    : effective.strictPluginOnlyCustomization === true

  if (disableAllHooks) {
    return {
      key: 'hooks',
      title: 'Hooks & Policy',
      level: allowManagedHooksOnly ? 'warning' : 'blocking',
      summary: allowManagedHooksOnly
        ? 'Non-managed hooks are disabled; only managed policy remains active'
        : 'All hooks are disabled',
      details: [
        `Policy packs: ${enabledPacks.join(', ') || 'none'}`,
        `Managed-only hooks: ${allowManagedHooksOnly ? 'enabled' : 'disabled'}`,
        `Plugin-only hook customization lock: ${strictPluginOnly ? 'enabled' : 'disabled'}`,
      ],
    }
  }

  return {
    key: 'hooks',
    title: 'Hooks & Policy',
    level: enabledPacks.length > 0 || allowManagedHooksOnly || strictPluginOnly ? 'ok' : 'warning',
    summary:
      enabledPacks.length > 0
        ? `${enabledPacks.length} policy pack${enabledPacks.length === 1 ? '' : 's'} active`
        : 'No built-in policy packs are active',
    details: [
      `Policy packs: ${enabledPacks.join(', ') || 'none'}`,
      `Managed-only hooks: ${allowManagedHooksOnly ? 'enabled' : 'disabled'}`,
      `Plugin-only hook customization lock: ${strictPluginOnly ? 'enabled' : 'disabled'}`,
    ],
  }
}

function collectSpecialistsSection(): OperatorStatusSection {
  const verifierEnabled = process.env.CLAUDE_CODE_DISABLE_VERIFIER !== '1'
  const reviewerEnabled = process.env.CLAUDE_CODE_DISABLE_REVIEWER !== '1'
  const details = [
    `${VERIFICATION_AGENT_TYPE}: ${verifierEnabled ? 'available' : 'disabled by env'}`,
    `${REVIEWER_AGENT_TYPE}: ${reviewerEnabled ? 'available' : 'disabled by env'}`,
    'Structured verifier/reviewer result parsing is compiled into the CLI.',
  ]

  if (!verifierEnabled || !reviewerEnabled) {
    return {
      key: 'specialists',
      title: 'Verifier & Reviewer',
      level: 'warning',
      summary: 'One or more specialist rails are disabled',
      details,
    }
  }

  return {
    key: 'specialists',
    title: 'Verifier & Reviewer',
    level: 'ok',
    summary: 'Verifier and reviewer specialists are available',
    details,
  }
}

function collectAgentTeamsSection(): OperatorStatusSection {
  const enabled = isAgentSwarmsEnabled()
  return {
    key: 'agent_teams',
    title: 'Agent Teams',
    level: enabled ? 'ok' : 'warning',
    summary: enabled
      ? 'Parallel agent-team features are enabled'
      : 'Parallel agent-team features are gated off for this session',
    details: [
      `Feature gate: ${enabled ? 'enabled' : 'disabled'}`,
      'VS Code-only team board settings are configured in the extension host and are not persisted in CLI settings.',
    ],
  }
}

async function collectResumeSection(currentCwd: string): Promise<OperatorStatusSection> {
  const worktreePaths = await getWorktreePathsPortable(currentCwd)
  const sessions = await loadSameRepoMessageLogs(worktreePaths, 10, 10)

  return {
    key: 'resume',
    title: 'Session Resume',
    level: sessions.length > 0 ? 'ok' : 'warning',
    summary:
      sessions.length > 0
        ? `${sessions.length} resumable session${sessions.length === 1 ? '' : 's'} discovered`
        : 'No resumable sessions were discovered for this repo scope',
    details: [
      `Worktrees detected: ${worktreePaths.length}`,
      `Recent sessions scanned: ${sessions.length}`,
    ],
  }
}

function describePolicySettingSource(): string {
  const origin = getPolicySettingsOrigin()
  if (origin === 'remote') {
    return 'Enterprise managed settings (remote)'
  }
  if (origin === 'plist') {
    return 'Enterprise managed settings (plist)'
  }
  if (origin === 'hklm') {
    return 'Enterprise managed settings (HKLM)'
  }
  if (origin === 'hkcu') {
    return 'Enterprise managed settings (HKCU)'
  }
  if (origin === 'file') {
    const { hasBase, hasDropIns } = getManagedFileSettingsPresence()
    if (hasBase && hasDropIns) {
      return 'Enterprise managed settings (file + drop-ins)'
    }
    if (hasDropIns) {
      return 'Enterprise managed settings (drop-ins)'
    }
    return 'Enterprise managed settings (file)'
  }
  return 'Enterprise managed settings'
}

export function formatOperatorStatusReport(
  report: OperatorStatusReport,
): string {
  const lines: string[] = [
    `OpenClaude status: ${report.level.toUpperCase()}`,
    `Workspace: ${report.workspaceCwd}`,
    `Generated: ${report.generatedAt}`,
    '',
  ]

  for (const section of report.sections) {
    lines.push(`${section.title}: ${section.level.toUpperCase()} - ${section.summary}`)
    for (const detail of section.details) {
      lines.push(`  - ${detail}`)
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}
