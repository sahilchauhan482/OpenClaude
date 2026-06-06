import figures from 'figures'
import * as React from 'react'
import { Suspense, use } from 'react'

import { getSessionId } from '../../bootstrap/state.js'
import type { LocalJSXCommandContext } from '../../commands.js'
import { useIsInsideModal } from '../../context/modalContext.js'
import { Box, Text, useTheme } from '../../ink.js'
import { useAppState } from '../../state/AppState.js'
import { getCwd } from '../../utils/cwd.js'
import type {
  OperatorStatusLevel,
  OperatorStatusReport,
  OperatorStatusSection,
} from '../../utils/operatorStatus.js'
import { getCurrentSessionTitle } from '../../utils/sessionStorage.js'
import {
  buildAccountProperties,
  buildAPIProviderProperties,
  buildIDEProperties,
  buildInstallationDiagnostics,
  buildInstallationHealthDiagnostics,
  buildMcpProperties,
  buildMemoryDiagnostics,
  buildSandboxProperties,
  buildSettingSourcesProperties,
  getModelDisplayLabel,
  type Diagnostic,
  type Property,
} from '../../utils/status.js'
import type { ThemeName } from '../../utils/theme.js'
import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js'

type Props = {
  context: LocalJSXCommandContext
  diagnosticsPromise: Promise<Diagnostic[]>
  operatorStatusPromise: Promise<OperatorStatusDisplayData>
}

export type OperatorStatusDisplayData =
  | {
      report: OperatorStatusReport
    }
  | {
      error: string
    }
  | null

function buildPrimarySection(): Property[] {
  const sessionId = getSessionId()
  const customTitle = getCurrentSessionTitle(sessionId)
  const nameValue = customTitle ?? <Text dimColor>/rename to add a name</Text>

  return [
    {
      label: 'Version',
      value: MACRO.DISPLAY_VERSION ?? MACRO.VERSION,
    },
    {
      label: 'Session name',
      value: nameValue,
    },
    {
      label: 'Session ID',
      value: sessionId,
    },
    {
      label: 'cwd',
      value: getCwd(),
    },
    ...buildAccountProperties(),
    ...buildAPIProviderProperties(),
  ]
}

function buildSecondarySection({
  mainLoopModel,
  mcp,
  theme,
  context,
}: {
  mainLoopModel: ReturnType<typeof useAppState>['mainLoopModel']
  mcp: ReturnType<typeof useAppState>['mcp']
  theme: ThemeName
  context: LocalJSXCommandContext
}): Property[] {
  return [
    {
      label: 'Model',
      value: getModelDisplayLabel(mainLoopModel),
    },
    ...buildIDEProperties(mcp.clients, context.options.ideInstallationStatus, theme),
    ...buildMcpProperties(mcp.clients, theme),
    ...buildSandboxProperties(),
    ...buildSettingSourcesProperties(),
  ]
}

export async function buildDiagnostics(): Promise<Diagnostic[]> {
  return [
    ...(await buildInstallationDiagnostics()),
    ...(await buildInstallationHealthDiagnostics()),
    ...(await buildMemoryDiagnostics()),
  ]
}

function PropertyValue({ value }: { value: Property['value'] }) {
  if (Array.isArray(value)) {
    return (
      <Box flexWrap="wrap" columnGap={1} flexShrink={99}>
        {value.map((item, index) => (
          <Text key={index}>
            {item}
            {index < value.length - 1 ? ',' : ''}
          </Text>
        ))}
      </Box>
    )
  }

  if (typeof value === 'string') {
    return <Text>{value}</Text>
  }

  return value
}

function LevelBadge({ level }: { level: OperatorStatusLevel }) {
  const color =
    level === 'ok' ? 'success' : level === 'warning' ? 'warning' : 'error'
  const icon =
    level === 'ok'
      ? figures.tick
      : level === 'warning'
        ? figures.warning
        : figures.cross

  return (
    <Text color={color}>
      {icon} {level.toUpperCase()}
    </Text>
  )
}

function OperatorSectionCard({ section }: { section: OperatorStatusSection }) {
  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Box flexDirection="row" gap={1}>
        <Text bold>{section.title}</Text>
        <LevelBadge level={section.level} />
      </Box>
      <Text wrap="wrap">{section.summary}</Text>
      {section.details.map((detail, index) => (
        <Box key={`${section.key}-${index}`} flexDirection="row" gap={1} paddingLeft={2}>
          <Text dimColor>{figures.pointer}</Text>
          <Text wrap="wrap">{detail}</Text>
        </Box>
      ))}
    </Box>
  )
}

function OperatorStatusPanel({
  promise,
}: {
  promise: Promise<OperatorStatusDisplayData>
}) {
  const data = use(promise)

  if (!data) {
    return null
  }

  if ('error' in data) {
    return (
      <Box flexDirection="column" paddingBottom={1}>
        <Text bold>Operator Readiness</Text>
        <Box flexDirection="row" gap={1} paddingX={1}>
          <Text color="warning">{figures.warning}</Text>
          <Text wrap="wrap">
            Unable to load operator status: {data.error}
          </Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Box flexDirection="row" gap={1}>
        <Text bold>Operator Readiness</Text>
        <LevelBadge level={data.report.level} />
      </Box>
      <Text dimColor>
        Workspace: {data.report.workspaceCwd} | Generated: {data.report.generatedAt}
      </Text>
      {data.report.sections.map(section => (
        <OperatorSectionCard key={section.key} section={section} />
      ))}
    </Box>
  )
}

function Diagnostics({ promise }: { promise: Promise<Diagnostic[]> }) {
  const diagnostics = use(promise)

  if (diagnostics.length === 0) {
    return null
  }

  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Text bold>System Diagnostics</Text>
      {diagnostics.map((diagnostic, index) => (
        <Box key={index} flexDirection="row" gap={1} paddingX={1}>
          <Text color="error">{figures.warning}</Text>
          {typeof diagnostic === 'string' ? (
            <Text wrap="wrap">{diagnostic}</Text>
          ) : (
            diagnostic
          )}
        </Box>
      ))}
    </Box>
  )
}

export function Status({
  context,
  diagnosticsPromise,
  operatorStatusPromise,
}: Props) {
  const mainLoopModel = useAppState(state => state.mainLoopModel)
  const mcp = useAppState(state => state.mcp)
  const [theme] = useTheme()
  const grow = useIsInsideModal() ? 1 : undefined
  const sections = [
    buildPrimarySection(),
    buildSecondarySection({ mainLoopModel, mcp, theme, context }),
  ]

  return (
    <Box flexDirection="column" flexGrow={grow}>
      <Box flexDirection="column" gap={1} flexGrow={grow}>
        {sections.map((properties, sectionIndex) =>
          properties.length > 0 ? (
            <Box key={sectionIndex} flexDirection="column">
              {properties.map((property, propertyIndex) => (
                <Box
                  key={propertyIndex}
                  flexDirection="row"
                  gap={1}
                  flexShrink={0}
                >
                  {property.label !== undefined ? <Text bold>{property.label}:</Text> : null}
                  <PropertyValue value={property.value} />
                </Box>
              ))}
            </Box>
          ) : null,
        )}

        <Suspense fallback={null}>
          <OperatorStatusPanel promise={operatorStatusPromise} />
        </Suspense>

        <Suspense fallback={null}>
          <Diagnostics promise={diagnosticsPromise} />
        </Suspense>
      </Box>

      <Text dimColor>
        <ConfigurableShortcutHint
          action="confirm:no"
          context="Settings"
          fallback="Esc"
          description="cancel"
        />
      </Text>
    </Box>
  )
}
