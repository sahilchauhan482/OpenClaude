import { afterEach, expect, mock, test } from 'bun:test'

const ORIGINAL_ENV = { ...process.env }

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key]
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

afterEach(() => {
  mock.restore()
  restoreEnv()
})

async function loadOperatorStatusModule() {
  const nonce = `${Date.now()}-${Math.random()}`
  return import(`./operatorStatus.ts?ts=${nonce}`)
}

test('collectOperatorStatus reports ok when core systems are healthy', async () => {
  mock.module('./settings/settings.js', () => ({
    getSettingsWithSources: () => ({
      effective: { hookPolicyPacks: ['safe-default'] },
      sources: [{ source: 'userSettings', settings: { hookPolicyPacks: ['safe-default'] } }],
    }),
    getPolicySettingsOrigin: () => null,
    getManagedFileSettingsPresence: () => ({ hasBase: false, hasDropIns: false }),
  }))
  mock.module('./settings/allErrors.js', () => ({
    getSettingsWithAllErrors: () => ({ settings: {}, errors: [] }),
  }))
  mock.module('./providerValidation.js', () => ({
    getProviderValidationError: async () => null,
  }))
  mock.module('./sessionStorage.js', () => ({
    loadSameRepoMessageLogs: async () => [{ sessionId: 's1' }, { sessionId: 's2' }],
  }))
  mock.module('./getWorktreePathsPortable.js', () => ({
    getWorktreePathsPortable: async () => ['d:/OpenClaude'],
  }))
  mock.module('./agentSwarmsEnabled.js', () => ({
    isAgentSwarmsEnabled: () => true,
  }))

  const { collectOperatorStatus, formatOperatorStatusReport } =
    await loadOperatorStatusModule()

  const report = await collectOperatorStatus('d:/OpenClaude')

  expect(report.level).toBe('ok')
  expect(report.sections.find(section => section.key === 'provider')?.level).toBe('ok')
  expect(report.sections.find(section => section.key === 'hooks')?.summary).toContain('1 policy pack')
  expect(formatOperatorStatusReport(report)).toContain('OpenClaude status: OK')
})

test('collectOperatorStatus surfaces blocking provider issues', async () => {
  mock.module('./settings/settings.js', () => ({
    getSettingsWithSources: () => ({
      effective: {},
      sources: [],
    }),
    getPolicySettingsOrigin: () => null,
    getManagedFileSettingsPresence: () => ({ hasBase: false, hasDropIns: false }),
  }))
  mock.module('./settings/allErrors.js', () => ({
    getSettingsWithAllErrors: () => ({ settings: {}, errors: [] }),
  }))
  mock.module('./providerValidation.js', () => ({
    getProviderValidationError: async () => 'OPENAI_API_KEY is missing.',
  }))
  mock.module('./sessionStorage.js', () => ({
    loadSameRepoMessageLogs: async () => [],
  }))
  mock.module('./getWorktreePathsPortable.js', () => ({
    getWorktreePathsPortable: async () => [],
  }))
  mock.module('./agentSwarmsEnabled.js', () => ({
    isAgentSwarmsEnabled: () => false,
  }))

  const { collectOperatorStatus } = await loadOperatorStatusModule()

  const report = await collectOperatorStatus('d:/OpenClaude')

  expect(report.level).toBe('blocking')
  expect(report.sections.find(section => section.key === 'provider')?.details).toContain(
    'OPENAI_API_KEY is missing.',
  )
})

test('collectOperatorStatus marks settings errors as warnings', async () => {
  mock.module('./settings/settings.js', () => ({
    getSettingsWithSources: () => ({
      effective: { disableAllHooks: true },
      sources: [{ source: 'localSettings', settings: { disableAllHooks: true } }],
    }),
    getPolicySettingsOrigin: () => null,
    getManagedFileSettingsPresence: () => ({ hasBase: false, hasDropIns: false }),
  }))
  mock.module('./settings/allErrors.js', () => ({
    getSettingsWithAllErrors: () => ({
      settings: {},
      errors: [{ file: 'settings.json', message: 'bad json' }],
    }),
  }))
  mock.module('./providerValidation.js', () => ({
    getProviderValidationError: async () => null,
  }))
  mock.module('./sessionStorage.js', () => ({
    loadSameRepoMessageLogs: async () => [],
  }))
  mock.module('./getWorktreePathsPortable.js', () => ({
    getWorktreePathsPortable: async () => ['d:/OpenClaude'],
  }))
  mock.module('./agentSwarmsEnabled.js', () => ({
    isAgentSwarmsEnabled: () => false,
  }))

  const { collectOperatorStatus } = await loadOperatorStatusModule()

  const report = await collectOperatorStatus('d:/OpenClaude')

  expect(report.sections.find(section => section.key === 'settings')?.level).toBe('warning')
  expect(report.sections.find(section => section.key === 'hooks')?.level).toBe('blocking')
})
