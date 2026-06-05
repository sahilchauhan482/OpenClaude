import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  acquireSharedMutationLock,
  releaseSharedMutationLock,
} from '../test/sharedMutationLock.js'
import { runWithCwdOverride } from '../utils/cwd.js'

const originalSimpleEnv = process.env.CLAUDE_CODE_SIMPLE
const originalMacro = (globalThis as Record<string, unknown>).MACRO
const hadOriginalMacro = Object.hasOwn(globalThis, 'MACRO')

let clearSystemPromptSections: typeof import('./systemPromptSections.js').clearSystemPromptSections
let getSystemPrompt: typeof import('./prompts.js').getSystemPrompt
let DEFAULT_AGENT_PROMPT: typeof import('./prompts.js').DEFAULT_AGENT_PROMPT
let CLI_SYSPROMPT_PREFIXES: typeof import('./system.js').CLI_SYSPROMPT_PREFIXES
let getCLISyspromptPrefix: typeof import('./system.js').getCLISyspromptPrefix
let CLAUDE_CODE_GUIDE_AGENT:
  typeof import('../tools/AgentTool/built-in/claudeCodeGuideAgent.js').CLAUDE_CODE_GUIDE_AGENT
let GENERAL_PURPOSE_AGENT:
  typeof import('../tools/AgentTool/built-in/generalPurposeAgent.js').GENERAL_PURPOSE_AGENT
let EXPLORE_AGENT:
  typeof import('../tools/AgentTool/built-in/exploreAgent.js').EXPLORE_AGENT
let PLAN_AGENT: typeof import('../tools/AgentTool/built-in/planAgent.js').PLAN_AGENT
let STATUSLINE_SETUP_AGENT:
  typeof import('../tools/AgentTool/built-in/statuslineSetup.js').STATUSLINE_SETUP_AGENT
let tempDirs: string[] = []

beforeAll(async () => {
  await acquireSharedMutationLock('constants/promptIdentity.test.ts')

  // MACRO is replaced at build time by Bun.define but not in test mode.
  // Define it globally under the shared lock before importing modules that use it.
  ;(globalThis as Record<string, unknown>).MACRO = {
    VERSION: '99.0.0',
    DISPLAY_VERSION: '0.0.0-test',
    BUILD_TIME: new Date().toISOString(),
    ISSUES_EXPLAINER:
      'report the issue at https://github.com/Gitlawb/openclaude/issues',
    PACKAGE_URL: '@gitlawb/openclaude',
    NATIVE_PACKAGE_URL: undefined,
  }

  ;({ clearSystemPromptSections } = await import('./systemPromptSections.js'))
  ;({ getSystemPrompt, DEFAULT_AGENT_PROMPT } = await import('./prompts.js'))
  ;({ CLI_SYSPROMPT_PREFIXES, getCLISyspromptPrefix } = await import('./system.js'))
  ;({ CLAUDE_CODE_GUIDE_AGENT } = await import(
    '../tools/AgentTool/built-in/claudeCodeGuideAgent.js'
  ))
  ;({ GENERAL_PURPOSE_AGENT } = await import(
    '../tools/AgentTool/built-in/generalPurposeAgent.js'
  ))
  ;({ EXPLORE_AGENT } = await import(
    '../tools/AgentTool/built-in/exploreAgent.js'
  ))
  ;({ PLAN_AGENT } = await import('../tools/AgentTool/built-in/planAgent.js'))
  ;({ STATUSLINE_SETUP_AGENT } = await import(
    '../tools/AgentTool/built-in/statuslineSetup.js'
  ))
})

afterAll(() => {
  try {
    if (hadOriginalMacro) {
      ;(globalThis as Record<string, unknown>).MACRO = originalMacro
    } else {
      delete (globalThis as Record<string, unknown>).MACRO
    }
  } finally {
    releaseSharedMutationLock()
  }
})

afterEach(() => {
  if (originalSimpleEnv === undefined) {
    delete process.env.CLAUDE_CODE_SIMPLE
  } else {
    process.env.CLAUDE_CODE_SIMPLE = originalSimpleEnv
  }
  clearSystemPromptSections()
})

afterEach(async () => {
  await Promise.all(
    tempDirs.map(dir => rm(dir, { recursive: true, force: true })),
  )
  tempDirs = []
})

test('CLI identity prefixes describe OpenClaude instead of Claude Code', () => {
  expect(getCLISyspromptPrefix()).toContain('OpenClaude')
  expect(getCLISyspromptPrefix()).not.toContain('Claude Code')
  expect(getCLISyspromptPrefix()).not.toContain("Anthropic's official CLI for Claude")

  for (const prefix of CLI_SYSPROMPT_PREFIXES) {
    expect(prefix).toContain('OpenClaude')
    expect(prefix).not.toContain('Claude Code')
    expect(prefix).not.toContain("Anthropic's official CLI for Claude")
  }
})

test('simple mode identity describes OpenClaude instead of Claude Code', async () => {
  process.env.CLAUDE_CODE_SIMPLE = '1'

  const prompt = await getSystemPrompt([], 'gpt-4o')

  expect(prompt[0]).toContain('OpenClaude')
  expect(prompt[0]).not.toContain('Claude Code')
  expect(prompt[0]).not.toContain("Anthropic's official CLI for Claude")
})

test('system prompt model identity updates when model changes mid-session', async () => {
  delete process.env.CLAUDE_CODE_SIMPLE
  clearSystemPromptSections()

  const firstPrompt = await getSystemPrompt([], 'old-test-model')
  const secondPrompt = await getSystemPrompt([], 'new-test-model')

  const firstText = firstPrompt.join('\n')
  const secondText = secondPrompt.join('\n')

  expect(firstText).toContain('You are powered by the model old-test-model.')
  expect(secondText).toContain('You are powered by the model new-test-model.')
  expect(secondText).not.toContain('You are powered by the model old-test-model.')
})

test('smaller models get stricter execution-discipline guidance', async () => {
  delete process.env.CLAUDE_CODE_SIMPLE
  clearSystemPromptSections()

  const prompt = await getSystemPrompt([], 'gpt-4o-mini')
  const text = prompt.join('\n')

  expect(text).toContain('# Execution Discipline')
  expect(text).toContain(
    'You are operating on a smaller or speed-optimized model.',
  )
  expect(text).toContain(
    'verify the workspace layout first. Check nearby package manifests, scripts, and node_modules locations before retrying.',
  )
})

test('larger models do not get smaller-model execution guidance', async () => {
  delete process.env.CLAUDE_CODE_SIMPLE
  clearSystemPromptSections()

  const prompt = await getSystemPrompt([], 'gpt-5.5')
  const text = prompt.join('\n')

  expect(text).not.toContain('# Execution Discipline')
  expect(text).not.toContain(
    'You are operating on a smaller or speed-optimized model.',
  )
})

test('system prompt includes repo intelligence for monorepo-style workspaces', async () => {
  delete process.env.CLAUDE_CODE_SIMPLE
  clearSystemPromptSections()

  const rootDir = await mkdtemp(join(tmpdir(), 'openclaude-repo-intel-root-'))
  const childDir = join(rootDir, 'packages', 'app')
  tempDirs.push(rootDir)

  await mkdir(childDir, { recursive: true })
  await writeFile(
    join(rootDir, 'package.json'),
    JSON.stringify(
      {
        name: 'monster-root',
        packageManager: 'pnpm@10.0.0',
        workspaces: ['packages/*'],
        scripts: {
          build: 'turbo build',
          test: 'turbo test',
        },
      },
      null,
      2,
    ),
  )
  await writeFile(
    join(childDir, 'package.json'),
    JSON.stringify(
      {
        name: 'monster-app',
        scripts: {
          dev: 'vite',
          lint: 'eslint .',
        },
      },
      null,
      2,
    ),
  )
  await writeFile(
    join(childDir, 'index.ts'),
    'export function startApp() { return true }\n',
  )
  await writeFile(
    join(childDir, 'useWorkspace.ts'),
    'export function useWorkspace() { return "ok" }\n',
  )

  const prompt = await runWithCwdOverride(childDir, async () =>
    getSystemPrompt([], 'gpt-5', [rootDir]),
  )
  const text = prompt.join('\n')

  expect(text).toContain('# Repo intelligence')
  expect(text).toContain('monster-app')
  expect(text).toContain('monster-root')
  expect(text).toContain('pkgmgr=pnpm@10.0.0')
  expect(text).toContain('workspaces=1')
  expect(text).toContain('scripts=dev, lint')
  expect(text).toContain('scripts=build, test')
  expect(text).toContain('# Repo map')
  expect(text).toContain('packages | child_packages=app')
  expect(text).toContain('dirs=packages')
  expect(text).toContain('# Code surfaces')
  expect(text).toContain('cwd:app:index.ts | kind=entry')
  expect(text).toContain('exports=startApp')
  expect(text).toContain('cwd:app:useWorkspace.ts | kind=hook')
  expect(text).toContain('exports=useWorkspace')
  expect(text).toContain(
    'Prefer commands from the nearest relevant package manifest instead of guessing a repo-wide command.',
  )
})

test('built-in agent prompts describe OpenClaude instead of Claude Code', () => {
  expect(DEFAULT_AGENT_PROMPT).toContain('OpenClaude')
  expect(DEFAULT_AGENT_PROMPT).not.toContain('Claude Code')
  expect(DEFAULT_AGENT_PROMPT).not.toContain("Anthropic's official CLI for Claude")

  const generalPrompt = GENERAL_PURPOSE_AGENT.getSystemPrompt({
    toolUseContext: { options: {} as never },
  })
  expect(generalPrompt).toContain('OpenClaude')
  expect(generalPrompt).not.toContain('Claude Code')
  expect(generalPrompt).not.toContain("Anthropic's official CLI for Claude")

  const explorePrompt = EXPLORE_AGENT.getSystemPrompt({
    toolUseContext: { options: {} as never },
  })
  expect(explorePrompt).toContain('OpenClaude')
  expect(explorePrompt).not.toContain('Claude Code')
  expect(explorePrompt).not.toContain("Anthropic's official CLI for Claude")

  const planPrompt = PLAN_AGENT.getSystemPrompt({
    toolUseContext: { options: {} as never },
  })
  expect(planPrompt).toContain('OpenClaude')
  expect(planPrompt).not.toContain('Claude Code')

  const statuslinePrompt = STATUSLINE_SETUP_AGENT.getSystemPrompt({
    toolUseContext: { options: {} as never },
  })
  expect(statuslinePrompt).toContain('OpenClaude')
  expect(statuslinePrompt).not.toContain('Claude Code')

  const guidePrompt = CLAUDE_CODE_GUIDE_AGENT.getSystemPrompt({
    toolUseContext: {
      options: {
        commands: [],
        agentDefinitions: { activeAgents: [] },
        mcpClients: [],
      } as never,
    },
  })
  expect(guidePrompt).toContain('OpenClaude')
  expect(guidePrompt).toContain('You are the OpenClaude guide agent.')
  expect(guidePrompt).toContain('**OpenClaude** (the CLI tool)')
  expect(guidePrompt).not.toContain('You are the Claude guide agent.')
  expect(guidePrompt).not.toContain('**Claude Code** (the CLI tool)')
})
