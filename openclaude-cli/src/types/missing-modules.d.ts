declare module '@ant/computer-use-mcp/sentinelApps' {
  export function getSentinelCategory(
    bundleId: string,
  ): 'shell' | 'filesystem' | 'system_settings' | null
}

declare module '@ant/computer-use-mcp/types' {
  export type CuPermissionRequest = {
    apps: Array<{
      requestedName: string
      resolved?: {
        bundleId: string
        displayName: string
      }
      alreadyGranted?: boolean
    }>
    requestedFlags: Record<string, boolean>
    reason?: string
    willHide?: string[]
    tccState?: {
      accessibility: boolean
      screenRecording: boolean
    }
  }

  export type CuPermissionResponse = {
    granted: Array<{
      bundleId: string
      displayName: string
      grantedAt: number
    }>
    denied: Array<{
      bundleId: string
      reason: 'user_denied' | 'not_installed'
    }>
    flags: Record<string, boolean>
  }

  export const DEFAULT_GRANT_FLAGS: Record<string, boolean>
}

declare module '../../tools/ReviewArtifactTool/ReviewArtifactTool.js' {
  import type { Tool } from '../../Tool.js'
  export const ReviewArtifactTool: Tool
}

declare module './ReviewArtifactPermissionRequest/ReviewArtifactPermissionRequest.js' {
  import React from 'react'
  import type { PermissionRequestProps } from '../PermissionRequest.js'
  export const ReviewArtifactPermissionRequest: React.ComponentType<PermissionRequestProps>
}

declare module '../../tools/WorkflowTool/WorkflowTool.js' {
  import type { Tool } from '../../Tool.js'
  export const WorkflowTool: Tool
}

declare module '../../tools/WorkflowTool/WorkflowPermissionRequest.js' {
  import React from 'react'
  import type { PermissionRequestProps } from '../../components/permissions/PermissionRequest.js'
  export const WorkflowPermissionRequest: React.ComponentType<PermissionRequestProps>
}

declare module './assistant/gate.js' {
  export function isKairosEnabled(): Promise<boolean>
}

declare module './assistant/sessionDiscovery.js' {
  export type AssistantDiscoveredSession = {
    id: string
    [key: string]: unknown
  }
  export function discoverAssistantSessions(): Promise<AssistantDiscoveredSession[]>
}

declare module './utils/eventLoopStallDetector.js' {
  export function startEventLoopStallDetector(): void
}

declare module './utils/sdkHeapDumpMonitor.js' {
  export function startSdkMemoryMonitor(): void
}

declare module './utils/sessionDataUploader.js' {
  export function uploadSessionData(...args: unknown[]): Promise<unknown>
}

declare module './utils/ccshareResume.js' {
  export function resumeFromCcshare(...args: unknown[]): Promise<unknown>
}

declare module './server/parseConnectUrl.js' {
  export function parseConnectUrl(url: string): {
    serverUrl: string
    authToken: string
  }
}

declare module './server/connectHeadless.js' {
  export function runConnectHeadless(
    config: unknown,
    prompt: string,
    outputFormat: string,
    interactive: boolean,
  ): Promise<void>
}

declare module './ssh/createSSHSession.js' {
  export class SSHSessionError extends Error {}
  export type SSHSession = {
    remoteCwd: string
    [key: string]: unknown
  }
  export function createSSHSession(
    config: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<SSHSession>
  export function createLocalSSHSession(
    config: Record<string, unknown>,
  ): SSHSession
}

declare module './server/server.js' {
  export function startServer(
    config: Record<string, unknown>,
    sessionManager: unknown,
    logger: unknown,
  ): {
    port?: number
    stop(force?: boolean): void
  }
}

declare module './server/sessionManager.js' {
  export class SessionManager {
    constructor(backend: unknown, options?: Record<string, unknown>)
    destroyAll(): Promise<void>
  }
}

declare module './server/backends/dangerousBackend.js' {
  export class DangerousBackend {}
}

declare module './server/serverBanner.js' {
  export function printBanner(
    config: Record<string, unknown>,
    authToken: string,
    actualPort: number,
  ): void
}

declare module './server/serverLog.js' {
  export function createServerLogger(): unknown
}

declare module './server/lockfile.js' {
  export function writeServerLock(lock: Record<string, unknown>): Promise<void>
  export function removeServerLock(): Promise<void>
  export function probeRunningServer(): Promise<{
    pid: number
    httpUrl: string
  } | null>
}

declare module 'src/cli/up.js' {
  export function up(...args: unknown[]): Promise<void>
}

declare module 'src/cli/rollback.js' {
  export function rollback(...args: unknown[]): Promise<void>
}

declare module './cli/handlers/ant.js' {
  export const ant: (...args: unknown[]) => Promise<void>
  export const antLogin: (...args: unknown[]) => Promise<void>
  export const antLogout: (...args: unknown[]) => Promise<void>
  export const antStatus: (...args: unknown[]) => Promise<void>
  export const antWhoami: (...args: unknown[]) => Promise<void>
  export const antSwitch: (...args: unknown[]) => Promise<void>
  export const antEnvs: (...args: unknown[]) => Promise<void>
  export const antSet: (...args: unknown[]) => Promise<void>
  export const antGet: (...args: unknown[]) => Promise<void>
}

declare module './services/skillSearch/prefetch.js' {
  export function prefetchSkillSearch(...args: unknown[]): Promise<void>
}

declare module './jobs/classifier.js' {
  export function classifyJob(...args: unknown[]): Promise<unknown>
}

declare module './utils/taskSummary.js' {
  export function maybeGenerateTaskSummary(...args: unknown[]): Promise<unknown>
}

declare module '../ssh/createSSHSession.js' {
  export class SSHSessionError extends Error {}
  export type SSHSession = {
    remoteCwd: string
    [key: string]: unknown
  }
}

declare module '../components/FeedbackSurvey/useFrustrationDetection.js' {
  export function useFrustrationDetection(...args: unknown[]): {
    state: string
    handleTranscriptSelect: (...innerArgs: unknown[]) => void
  }
}

declare module '../hooks/notifs/useAntOrgWarningNotification.js' {
  export function useAntOrgWarningNotification(...args: unknown[]): void
}

declare module '../tools/WebBrowserTool/WebBrowserPanel.js' {
  import React from 'react'
  export const TungstenLiveMonitor: React.ComponentType<Record<string, unknown>>
}

declare module '../services/compact/snipProjection.js' {
  export function projectSnippedMessages<T>(messages: T[]): T[]
}

// --- Internal modules not yet implemented ---

declare module '../../bridge/peerSessions.js' {
  export function getPeerSessions(): unknown[]
  export function addPeerSession(session: unknown): void
}

declare module '../../entrypoints/sdk/sdkUtilityTypes.js' {
  export type SdkUtilityType = Record<string, unknown>
}

declare module './sdkUtilityTypes.js' {
  export type SdkUtilityType = Record<string, unknown>
}

declare module '../../services/skillSearch/featureCheck.js' {
  export function isSkillSearchEnabled(): boolean
}

declare module '../services/skillSearch/featureCheck.js' {
  export function isSkillSearchEnabled(): boolean
}

declare module '../../services/skillSearch/remoteSkillLoader.js' {
  export function loadRemoteSkills(...args: unknown[]): Promise<unknown>
}

declare module '../../services/skillSearch/remoteSkillState.js' {
  export function getRemoteSkillState(): unknown
}

declare module '../../services/skillSearch/telemetry.js' {
  export function trackSkillSearch(...args: unknown[]): void
}

declare module '../services/skillSearch/signals.js' {
  export function getSkillSearchSignals(): unknown
}

declare module '../../utils/udsClient.js' {
  export function createUdsClient(...args: unknown[]): unknown
}

declare module './udsClient.js' {
  export function createUdsClient(...args: unknown[]): unknown
}

declare module './utils/udsMessaging.js' {
  export function sendUdsMessage(...args: unknown[]): Promise<unknown>
}

declare module '../SendUserFileTool/prompt.js' {
  export const prompt: string
  export const userFacingName: string
}

declare module '../tools/SendUserFileTool/prompt.js' {
  export const prompt: string
  export const userFacingName: string
}

declare module '../bridge/webhookSanitizer.js' {
  export function sanitizeWebhookPayload(payload: unknown): unknown
}

declare module '../cli/bg.js' {
  export function runInBackground(...args: unknown[]): Promise<unknown>
}

declare module '../cli/handlers/templateJobs.js' {
  export function handleTemplateJob(...args: unknown[]): Promise<unknown>
}

declare module '../daemon/main.js' {
  export function startDaemon(...args: unknown[]): Promise<void>
}

declare module '../daemon/workerRegistry.js' {
  export function getWorkerRegistry(): unknown
}

declare module '../environment-runner/main.js' {
  export function startEnvironmentRunner(...args: unknown[]): Promise<void>
}

declare module '../self-hosted-runner/main.js' {
  export function startSelfHostedRunner(...args: unknown[]): Promise<void>
}

declare module '../services/compact/cachedMCConfig.js' {
  export function getCachedMCConfig(): unknown
}

declare module '../services/sessionTranscript/sessionTranscript.js' {
  export function getSessionTranscript(...args: unknown[]): Promise<unknown>
}

declare module '../sessionTranscript/sessionTranscript.js' {
  export function getSessionTranscript(...args: unknown[]): Promise<unknown>
}

declare module '../ssh/SSHSessionManager.js' {
  export class SSHSessionManager {
    constructor(...args: unknown[])
    getSession(id: string): unknown
    destroyAll(): Promise<void>
  }
}

declare module '../tools/DiscoverSkillsTool/prompt.js' {
  export const prompt: string
  export const userFacingName: string
}

declare module '../tools/SnipTool/prompt.js' {
  export const prompt: string
  export const userFacingName: string
}

declare module '../types/fileSuggestion.js' {
  export interface FileSuggestion {
    path: string
    type: string
    [key: string]: unknown
  }
}

declare module '../types/statusLine.js' {
  export interface StatusLineConfig {
    [key: string]: unknown
  }
}

declare module './LocalWorkflowTask/LocalWorkflowTask.js' {
  export class LocalWorkflowTask {
    constructor(...args: unknown[])
  }
}

declare module 'src/tasks/LocalWorkflowTask/LocalWorkflowTask.js' {
  export class LocalWorkflowTask {
    constructor(...args: unknown[])
  }
}

declare module './MonitorMcpDetailDialog.js' {
  import React from 'react'
  const MonitorMcpDetailDialog: React.ComponentType<Record<string, unknown>>
  export default MonitorMcpDetailDialog
}

declare module './WorkflowDetailDialog.js' {
  import React from 'react'
  const WorkflowDetailDialog: React.ComponentType<Record<string, unknown>>
  export default WorkflowDetailDialog
}

declare module './attributionTrailer.js' {
  export function getAttributionTrailer(...args: unknown[]): string
}

declare module './sdk/settingsTypes.generated.js' {
  export interface GeneratedSettingsTypes {
    [key: string]: unknown
  }
}

declare module './UserCrossSessionMessage.js' {
  import React from 'react'
  const UserCrossSessionMessage: React.ComponentType<Record<string, unknown>>
  export default UserCrossSessionMessage
}

declare module './UserGitHubWebhookMessage.js' {
  import React from 'react'
  const UserGitHubWebhookMessage: React.ComponentType<Record<string, unknown>>
  export default UserGitHubWebhookMessage
}

// --- Skill .md file imports ---

declare module '*.md' {
  const content: string
  export default content
}

// --- Native addon modules ---

declare module '@ant/claude-for-chrome-mcp' {
  export function createMcpServer(...args: unknown[]): unknown
}

declare module '@ant/computer-use-input' {
  export function createInputHandler(...args: unknown[]): unknown
}

declare module '@ant/computer-use-mcp' {
  export function createComputerUseMcp(...args: unknown[]): unknown
}

declare module '@ant/computer-use-swift' {
  export function createSwiftBridge(...args: unknown[]): unknown
}

declare module 'asciichart' {
  export function plot(data: number[], config?: Record<string, unknown>): string
}

declare module 'audio-capture-napi' {
  export function createAudioCapture(...args: unknown[]): unknown
}

declare module 'cacache' {
  export function get(cachePath: string, key: string): Promise<{ data: Buffer; metadata: unknown }>
  export function put(cachePath: string, key: string, data: Buffer): Promise<unknown>
  export const ls: {
    stream(cachePath: string): NodeJS.ReadableStream
  }
}

declare module 'plist' {
  export function parse(xml: string): unknown
  export function build(obj: unknown): string
}

declare module 'url-handler-napi' {
  export function registerUrlHandler(...args: unknown[]): unknown
}

// --- Test query-string imports ---

declare module '*.js?*' {
  const mod: Record<string, unknown>
  export = mod
}

declare module '*.ts?*' {
  const mod: Record<string, unknown>
  export = mod
}
