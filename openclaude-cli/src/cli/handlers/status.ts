/* eslint-disable custom-rules/no-process-exit -- CLI subcommand handler intentionally exits */

import { cwd } from 'node:process'

import { setup } from '../../setup.js'
import { enableConfigs } from '../../utils/config.js'
import { collectOperatorStatus, formatOperatorStatusReport } from '../../utils/operatorStatus.js'
import { jsonStringify } from '../../utils/slowOperations.js'

export async function operatorStatusHandler(opts: {
  json?: boolean
  text?: boolean
  exitCode?: boolean
}): Promise<void> {
  enableConfigs()
  await setup(cwd(), 'default', false, false, undefined, false)
  const report = await collectOperatorStatus()
  const wantsJson = opts.json === true && opts.text !== true

  if (wantsJson) {
    process.stdout.write(jsonStringify(report, null, 2) + '\n')
  } else {
    process.stdout.write(formatOperatorStatusReport(report) + '\n')
  }

  if (opts.exitCode && report.level === 'blocking') {
    process.exit(1)
  }

  process.exit(0)
}
