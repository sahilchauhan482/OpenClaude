import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildRepoIntelligenceSummary } from './repoIntelligence.js'
import { runWithCwdOverride } from './cwd.js'

let tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.map(dir => rm(dir, { recursive: true, force: true })),
  )
  tempDirs = []
})

describe('buildRepoIntelligenceSummary', () => {
  test('returns null when no nearby package manifests exist', async () => {
    const isolatedRoot = await mkdtemp(join(tmpdir(), 'openclaude-repo-intel-empty-root-'))
    const tempDir = join(isolatedRoot, 'workspace', 'sandbox')
    tempDirs.push(isolatedRoot)
    await mkdir(tempDir, { recursive: true })

    const summary = await runWithCwdOverride(tempDir, async () =>
      buildRepoIntelligenceSummary(),
    )

    expect(summary).toBeNull()
  })

  test('summarizes current package and parent workspace manifests', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'openclaude-repo-intel-'))
    const childDir = join(rootDir, 'packages', 'cli')
    tempDirs.push(rootDir)

    await mkdir(childDir, { recursive: true })
    await mkdir(join(rootDir, 'apps', 'web'), { recursive: true })
    await mkdir(join(rootDir, 'docs'), { recursive: true })
    await writeFile(
      join(rootDir, 'package.json'),
      JSON.stringify(
        {
          name: 'openclaude-root',
          packageManager: 'pnpm@10.1.0',
          workspaces: ['packages/*', 'apps/*'],
          scripts: {
            build: 'turbo build',
            test: 'turbo test',
          },
        },
        null,
        2,
      ),
    )
    await writeFile(join(rootDir, 'turbo.json'), '{}\n')
    await writeFile(join(rootDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    await writeFile(
      join(childDir, 'package.json'),
      JSON.stringify(
        {
          name: 'openclaude-cli',
          scripts: {
            dev: 'bun run dev',
            test: 'bun test',
            lint: 'biome check .',
          },
        },
        null,
        2,
      ),
    )
    await writeFile(
      join(childDir, 'index.ts'),
      'export function bootCli() { return true }\n',
    )
    await writeFile(
      join(childDir, 'useRepoMap.ts'),
      'export function useRepoMap() { return [] }\n',
    )

    const summary = await runWithCwdOverride(childDir, async () =>
      buildRepoIntelligenceSummary(undefined, 'update repo map hook and cli boot flow'),
    )

    expect(summary).not.toBeNull()
    expect(summary).toContain('# Repo intelligence')
    expect(summary).toContain('openclaude-cli')
    expect(summary).toContain('openclaude-root')
    expect(summary).toContain('pkgmgr=pnpm@10.1.0')
    expect(summary).toContain('workspaces=2')
    expect(summary).toContain('scripts=dev, test, lint')
    expect(summary).toContain('scripts=build, test')
    expect(summary).toContain('# Repo map')
    expect(summary).toContain('packages | child_packages=cli')
    expect(summary).toContain('dirs=apps, docs, packages')
    expect(summary).toContain('configs=package.json, pnpm-workspace.yaml, turbo.json')
    expect(summary).toContain('# Code surfaces')
    expect(summary).toContain('cwd:cli:index.ts | kind=entry')
    expect(summary).toContain('exports=bootCli')
    expect(summary).toContain('cwd:cli:useRepoMap.ts | kind=hook')
    expect(summary).toContain('exports=useRepoMap')
    expect(summary).toContain('relevance=')
    expect(summary).toContain('Task-aware ranking is active for: update repo map hook and cli boot flow')
    expect(summary).toContain('Use the repo map to find likely edit targets before broad file searches.')
    expect(summary).toContain(
      'Use code surfaces to start from high-signal files when the task mentions architecture, initialization, hooks, or exported APIs.',
    )
  })

  test('can build repo map even when root has no package manifest', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'openclaude-repo-layout-'))
    const cliDir = join(rootDir, 'openclaude-cli')
    const vscodeDir = join(rootDir, 'openclaude-vscode')
    tempDirs.push(rootDir)

    await mkdir(join(cliDir, 'src'), { recursive: true })
    await mkdir(join(vscodeDir, 'webview'), { recursive: true })
    await writeFile(join(rootDir, 'README.md'), '# OpenClaude\n')
    await writeFile(
      join(cliDir, 'package.json'),
      JSON.stringify(
        {
          name: 'openclaude-cli',
          scripts: {
            test: 'bun test',
          },
        },
        null,
        2,
      ),
    )
    await writeFile(
      join(vscodeDir, 'package.json'),
      JSON.stringify(
        {
          name: 'openclaude-vscode',
          scripts: {
            build: 'vite build',
          },
        },
        null,
        2,
      ),
    )
    await writeFile(
      join(vscodeDir, 'App.tsx'),
      'export function App() { return <View /> }\n',
    )

    const summary = await runWithCwdOverride(rootDir, async () =>
      buildRepoIntelligenceSummary(),
    )

    expect(summary).not.toBeNull()
    expect(summary).toContain('# Repo map')
    expect(summary).toContain('child_packages=openclaude-cli, openclaude-vscode')
    expect(summary).toContain('configs=README.md')
    expect(summary).toContain('# Code surfaces')
    expect(summary).toContain('openclaude-vscode/App.tsx | kind=component')
    expect(summary).toContain('exports=App')
  })

  test('prioritizes path and export matches from task words', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'openclaude-repo-relevance-'))
    tempDirs.push(rootDir)
    await writeFile(
      join(rootDir, 'package.json'),
      JSON.stringify({ name: 'intel-root', scripts: { test: 'bun test' } }, null, 2),
    )
    await mkdir(join(rootDir, 'src'), { recursive: true })
    await writeFile(
      join(rootDir, 'src', 'sessionDiscovery.ts'),
      'export function sessionDiscoveryRank() { return true }\n',
    )
    await writeFile(
      join(rootDir, 'src', 'generic.ts'),
      'export function helper() { return true }\n',
    )

    const summary = await runWithCwdOverride(rootDir, async () =>
      buildRepoIntelligenceSummary(undefined, 'fix session discovery ranking'),
    )

    expect(summary).not.toBeNull()
    expect(summary).toContain('src/sessionDiscovery.ts')
    expect(summary).toMatch(/path:session|export~session/)
  })
})
