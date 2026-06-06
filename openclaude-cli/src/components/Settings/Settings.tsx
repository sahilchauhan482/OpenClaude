import * as React from 'react'
import { Suspense, useState } from 'react'

import type { LocalJSXCommandContext, CommandResultDisplay } from '../../commands.js'
import { useIsInsideModal, useModalOrTerminalSize } from '../../context/modalContext.js'
import { useExitOnCtrlCDWithKeybindings } from '../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import { Pane } from '../design-system/Pane.js'
import { Tab, Tabs } from '../design-system/Tabs.js'
import { Config } from './Config.js'
import {
  buildDiagnostics,
  Status,
  type OperatorStatusDisplayData,
} from './Status.js'
import { Usage } from './Usage.js'

type Props = {
  onClose: (
    result?: string,
    options?: {
      display?: CommandResultDisplay
    },
  ) => void
  context: LocalJSXCommandContext
  defaultTab: 'Status' | 'Config' | 'Usage' | 'Gates'
}

export function Settings({ onClose, context, defaultTab }: Props) {
  const [selectedTab, setSelectedTab] = useState(defaultTab)
  const [tabsHidden, setTabsHidden] = useState(false)
  const [configOwnsEsc, setConfigOwnsEsc] = useState(false)
  const [gatesOwnsEsc] = useState(false)
  const insideModal = useIsInsideModal()
  const { rows } = useModalOrTerminalSize(useTerminalSize())
  const contentHeight = insideModal
    ? rows + 1
    : Math.max(15, Math.min(Math.floor(rows * 0.8), 30))

  const [diagnosticsPromise] = useState(() => buildDiagnostics().catch(() => []))
  const [operatorStatusPromise] = useState(() =>
    import('../../utils/operatorStatus.js')
      .then(module => module.collectOperatorStatus())
      .then(report => ({ report }) satisfies OperatorStatusDisplayData)
      .catch(error => ({
        error: error instanceof Error ? error.message : String(error),
      })),
  )

  useExitOnCtrlCDWithKeybindings()

  const handleEscape = () => {
    if (tabsHidden) {
      return
    }
    onClose('Status dialog dismissed', { display: 'system' })
  }

  useKeybinding('confirm:no', handleEscape, {
    context: 'Settings',
    isActive:
      !tabsHidden &&
      !(selectedTab === 'Config' && configOwnsEsc) &&
      !(selectedTab === 'Gates' && gatesOwnsEsc),
  })

  return (
    <Pane color="permission">
      <Tabs
        color="permission"
        selectedTab={selectedTab}
        onTabChange={setSelectedTab}
        hidden={tabsHidden}
        initialHeaderFocused={defaultTab !== 'Config' && defaultTab !== 'Gates'}
        contentHeight={tabsHidden || insideModal ? undefined : contentHeight}
      >
        <Tab key="status" title="Status">
          <Status
            context={context}
            diagnosticsPromise={diagnosticsPromise}
            operatorStatusPromise={operatorStatusPromise}
          />
        </Tab>
        <Tab key="config" title="Config">
          <Suspense fallback={null}>
            <Config
              context={context}
              onClose={onClose}
              setTabsHidden={setTabsHidden}
              onIsSearchModeChange={setConfigOwnsEsc}
              contentHeight={contentHeight}
            />
          </Suspense>
        </Tab>
        <Tab key="usage" title="Usage">
          <Usage />
        </Tab>
      </Tabs>
    </Pane>
  )
}
