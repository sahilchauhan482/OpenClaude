import { readdir } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, sep } from 'path'

import { getCwd } from './cwd.js'
import { pathExists } from './file.js'
import { readFileSync } from './fileRead.js'

type PackageManifestSummary = {
  path: string
  name?: string
  packageManager?: string
  scripts: string[]
  workspaceCount?: number
}

type WorkspaceStructureSummary = {
  path: string
  childPackages: string[]
  importantDirectories: string[]
  configFiles: string[]
}

type CodeSurfaceSummary = {
  path: string
  surfaces: FileSurfaceSummary[]
}

type TaskRelevance = {
  query: string
  tokens: string[]
}

type FileSurfaceSummary = {
  file: string
  exports: string[]
  kind: 'entry' | 'hook' | 'component' | 'module'
  score: number
  reasons: string[]
}

const IMPORTANT_DIRECTORIES = new Set([
  'src',
  'app',
  'apps',
  'packages',
  'webview',
  'test',
  'tests',
  'spec',
  'scripts',
  'docs',
  'server',
  'client',
  'backend',
  'frontend',
  'lib',
])

const IMPORTANT_CONFIG_FILES = new Set([
  'package.json',
  'tsconfig.json',
  'tsconfig.base.json',
  'bunfig.toml',
  'turbo.json',
  'pnpm-workspace.yaml',
  'vite.config.ts',
  'vite.config.js',
  'vitest.config.ts',
  'vitest.config.js',
  'biome.json',
  'biome.jsonc',
  'eslint.config.js',
  'eslint.config.mjs',
  'README.md',
])

const SCAN_STOP_NAMES = new Set(['tmp', 'temp', 'var', 'private'])
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.git',
])
const CODE_FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])
const IMPORTANT_ENTRY_BASENAMES = new Set([
  'index',
  'main',
  'app',
  'server',
  'client',
  'root',
  'entry',
])
const NESTED_CODE_DIRECTORIES = new Set([
  'src',
  'app',
  'lib',
  'server',
  'client',
  'backend',
  'frontend',
  'hooks',
  'components',
  'utils',
  'webview',
 ])

export async function buildRepoIntelligenceSummary(
  additionalWorkingDirectories?: string[],
  taskDescription?: string,
): Promise<string | null> {
  const roots = dedupeRoots([getCwd(), ...(additionalWorkingDirectories ?? [])])
  const manifests: PackageManifestSummary[] = []
  const workspaceRoots: WorkspaceStructureSummary[] = []
  const codeSurfaces: CodeSurfaceSummary[] = []
  const taskRelevance = buildTaskRelevance(taskDescription)

  for (const root of roots.slice(0, 4)) {
    const manifest = await readPackageManifestSummary(root)
    if (manifest) {
      manifests.push(manifest)
    }
  }

  for (const root of roots.slice(0, 3)) {
    const workspaceRoot = await readWorkspaceStructureSummary(root)
    if (workspaceRoot) {
      workspaceRoots.push(workspaceRoot)
    }

    const codeSurface = await readCodeSurfaceSummary(root, taskRelevance)
    if (codeSurface) {
      codeSurfaces.push(codeSurface)
    }
  }

  if (
    manifests.length === 0 &&
    workspaceRoots.length === 0 &&
    codeSurfaces.length === 0
  ) {
    return null
  }

  const lines = manifests.map(manifest => {
    const parts = [
      manifest.name ? `${manifest.name}` : manifest.path,
      manifest.packageManager ? `pkgmgr=${manifest.packageManager}` : null,
      manifest.workspaceCount && manifest.workspaceCount > 0
        ? `workspaces=${manifest.workspaceCount}`
        : null,
      manifest.scripts.length > 0
        ? `scripts=${manifest.scripts.slice(0, 6).join(', ')}`
        : 'scripts=none',
    ].filter(Boolean)

    return `- ${parts.join(' | ')}`
  })

  const repoMapLines = workspaceRoots.map(workspaceRoot => {
    const parts = [
      formatWorkspaceLabel(workspaceRoot.path),
      workspaceRoot.childPackages.length > 0
        ? `child_packages=${workspaceRoot.childPackages.slice(0, 4).join(', ')}`
        : null,
      workspaceRoot.importantDirectories.length > 0
        ? `dirs=${workspaceRoot.importantDirectories.slice(0, 5).join(', ')}`
        : null,
      workspaceRoot.configFiles.length > 0
        ? `configs=${workspaceRoot.configFiles.slice(0, 5).join(', ')}`
        : null,
    ].filter(Boolean)

    return `- ${parts.join(' | ')}`
  })

  const codeSurfaceLines = codeSurfaces.flatMap(codeSurface =>
    codeSurface.surfaces.map(surface => {
      const parts = [
        `${formatWorkspaceLabel(codeSurface.path)}:${surface.file}`,
        `kind=${surface.kind}`,
        surface.reasons.length > 0
          ? `relevance=${surface.reasons.slice(0, 3).join(', ')}`
          : null,
        surface.exports.length > 0
          ? `exports=${surface.exports.slice(0, 4).join(', ')}`
          : null,
      ].filter(Boolean)

      return `- ${parts.join(' | ')}`
    }),
  )

  return [
    '# Repo intelligence',
    'Use this workspace summary before choosing commands or edit targets:',
    ...lines,
    ...(repoMapLines.length > 0
      ? ['# Repo map', ...repoMapLines]
      : []),
    ...(codeSurfaceLines.length > 0
      ? ['# Code surfaces', ...codeSurfaceLines]
      : []),
    '- Prefer commands from the nearest relevant package manifest instead of guessing a repo-wide command.',
    '- In monorepos, verify whether the task belongs to the root workspace or a child package before running tests, builds, or installs.',
    '- Use the repo map to find likely edit targets before broad file searches.',
    '- Use code surfaces to start from high-signal files when the task mentions architecture, initialization, hooks, or exported APIs.',
    taskRelevance
      ? `- Task-aware ranking is active for: ${taskRelevance.query}`
      : '- When the user names a feature, test, hook, route, model, or config, prefer files whose exports and paths match those task words first.',
  ].join('\n')
}

async function readPackageManifestSummary(
  root: string,
): Promise<PackageManifestSummary | null> {
  const manifestPath = join(root, 'package.json')
  if (!(await pathExists(manifestPath))) {
    return null
  }

  try {
    const parsed = JSON.parse(readFileSync(manifestPath)) as {
      name?: string
      packageManager?: string
      scripts?: Record<string, string>
      workspaces?: unknown
    }

    return {
      path: root,
      name: parsed.name,
      packageManager: parsed.packageManager,
      scripts: Object.keys(parsed.scripts ?? {}),
      workspaceCount: countWorkspaces(parsed.workspaces),
    }
  } catch {
    return {
      path: root,
      scripts: [],
    }
  }
}

function countWorkspaces(workspaces: unknown): number | undefined {
  if (Array.isArray(workspaces)) {
    return workspaces.length
  }

  if (
    workspaces &&
    typeof workspaces === 'object' &&
    Array.isArray((workspaces as { packages?: unknown }).packages)
  ) {
    return ((workspaces as { packages: unknown[] }).packages).length
  }

  return undefined
}

async function readWorkspaceStructureSummary(
  root: string,
): Promise<WorkspaceStructureSummary | null> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    const childPackages: string[] = []
    const importantDirectories: string[] = []
    const configFiles: string[] = []

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue
      }

      const entryPath = join(root, entry.name)
      if (entry.isDirectory()) {
        if (IMPORTANT_DIRECTORIES.has(entry.name)) {
          importantDirectories.push(toRelativeDisplayPath(root, entryPath))
        }

        if (await pathExists(join(entryPath, 'package.json'))) {
          childPackages.push(toRelativeDisplayPath(root, entryPath))
        }
        continue
      }

      if (entry.isFile() && IMPORTANT_CONFIG_FILES.has(entry.name)) {
        configFiles.push(entry.name)
      }
    }

    if (
      childPackages.length === 0 &&
      importantDirectories.length === 0 &&
      configFiles.length === 0
    ) {
      return null
    }

    return {
      path: root,
      childPackages,
      importantDirectories,
      configFiles,
    }
  } catch {
    return null
  }
}

async function readCodeSurfaceSummary(
  root: string,
  taskRelevance: TaskRelevance | null,
): Promise<CodeSurfaceSummary | null> {
  const files = await collectCandidateCodeFiles(root)
  const surfaces: FileSurfaceSummary[] = []

  for (const file of files) {
    let source: string
    try {
      source = readFileSync(file)
    } catch {
      continue
    }

    const surface = summarizeCodeSurface(root, file, source, taskRelevance)
    if (surface) {
      surfaces.push(surface)
    }
  }

  surfaces.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score
    }
    return a.file.localeCompare(b.file)
  })

  const topSurfaces = surfaces.slice(0, 4)
  if (topSurfaces.length === 0) {
    return null
  }

  return {
    path: root,
    surfaces: topSurfaces,
  }
}

async function collectCandidateCodeFiles(root: string): Promise<string[]> {
  const queue = [{ dir: root, depth: 0 }]
  const seen = new Set<string>()
  const files: string[] = []

  while (queue.length > 0 && seen.size < 18 && files.length < 20) {
    const current = queue.shift()
    if (!current || seen.has(current.dir)) {
      continue
    }

    seen.add(current.dir)

    let entries: import('node:fs').Dirent[]
    try {
      entries = await readdir(current.dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue
      }

      const entryPath = join(current.dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) {
          continue
        }
        if (shouldDescendIntoDirectory(current.depth, entry.name, entryPath)) {
          queue.push({ dir: entryPath, depth: current.depth + 1 })
        }
        continue
      }

      if (
        entry.isFile() &&
        CODE_FILE_EXTENSIONS.has(extname(entry.name)) &&
        shouldInspectCodeFile(entry.name, current.dir)
      ) {
        files.push(entryPath)
      }
    }
  }

  return files
}

function shouldDescendIntoDirectory(
  depth: number,
  name: string,
  path: string,
): boolean {
  if (depth === 0) {
    return IMPORTANT_DIRECTORIES.has(name) || hasPathLikePackage(path)
  }

  if (depth === 1) {
    return NESTED_CODE_DIRECTORIES.has(name)
  }

  return false
}

function hasPathLikePackage(path: string): boolean {
  try {
    return !!readFileSync(join(path, 'package.json'))
  } catch {
    return false
  }
}

function shouldInspectCodeFile(fileName: string, parentDir: string): boolean {
  const ext = extname(fileName)
  if (!CODE_FILE_EXTENSIONS.has(ext)) {
    return false
  }

  const base = basename(fileName, ext)
  if (IMPORTANT_ENTRY_BASENAMES.has(base)) {
    return true
  }

  if (base.startsWith('use') || /^[A-Z]/.test(base)) {
    return true
  }

  const parent = basename(parentDir)
  return NESTED_CODE_DIRECTORIES.has(parent) || IMPORTANT_DIRECTORIES.has(parent)
}

function summarizeCodeSurface(
  root: string,
  file: string,
  source: string,
  taskRelevance: TaskRelevance | null,
): FileSurfaceSummary | null {
  const exports = extractNamedExports(source)
  const kind = detectCodeSurfaceKind(file, source)
  const { score, reasons } = scoreCodeSurface(
    file,
    exports,
    kind,
    taskRelevance,
  )

  if (score <= 0) {
    return null
  }

  return {
    file: normalizeRelativePath(relative(root, file)),
    exports,
    kind,
    score,
    reasons,
  }
}

function extractNamedExports(source: string): string[] {
  const names = new Set<string>()
  const patterns = [
    /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g,
    /export\s+class\s+([A-Za-z0-9_]+)/g,
    /export\s+const\s+([A-Za-z0-9_]+)/g,
    /export\s+(?:interface|type|enum)\s+([A-Za-z0-9_]+)/g,
  ]

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) {
        names.add(match[1])
      }
    }
  }

  for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) {
    const block = match[1]
    if (!block) {
      continue
    }

    for (const chunk of block.split(',')) {
      const cleaned = chunk.trim().split(/\s+as\s+/i)[0]?.trim()
      if (cleaned) {
        names.add(cleaned)
      }
    }
  }

  const defaultFunction = source.match(
    /export\s+default\s+function\s+([A-Za-z0-9_]+)/,
  )
  if (defaultFunction?.[1]) {
    names.add(defaultFunction[1])
  }

  return Array.from(names)
}

function detectCodeSurfaceKind(
  file: string,
  source: string,
): 'entry' | 'hook' | 'component' | 'module' {
  const ext = extname(file)
  const base = basename(file, ext)

  if (IMPORTANT_ENTRY_BASENAMES.has(base)) {
    return 'entry'
  }

  if (base.startsWith('use')) {
    return 'hook'
  }

  if (
    ext === '.tsx' ||
    /^[A-Z]/.test(base) ||
    /return\s*\(/.test(source) ||
    /<[A-Z][A-Za-z0-9]*/.test(source)
  ) {
    return 'component'
  }

  return 'module'
}

function scoreCodeSurface(
  file: string,
  exports: string[],
  kind: 'entry' | 'hook' | 'component' | 'module',
  taskRelevance: TaskRelevance | null,
): { score: number; reasons: string[] } {
  const normalized = normalizeRelativePath(file)
  let score = exports.length * 2
  const reasons: string[] = []

  if (kind === 'entry') {
    score += 6
    reasons.push('entry')
  } else if (kind === 'hook') {
    score += 4
    reasons.push('hook')
  } else if (kind === 'component') {
    score += 3
    reasons.push('component')
  } else {
    score += 1
  }

  if (normalized.includes('src/')) {
    score += 2
    reasons.push('src')
  }
  if (normalized.includes('webview/')) {
    score += 1
    reasons.push('webview')
  }
  if (normalized.includes('/test') || normalized.includes('.test.')) {
    score -= 4
    reasons.push('test-penalty')
  }

  if (taskRelevance) {
    const taskScore = scoreTaskRelevance(normalized, exports, taskRelevance)
    score += taskScore.score
    reasons.push(...taskScore.reasons)
  }

  return { score, reasons: dedupeReasons(reasons) }
}

function buildTaskRelevance(taskDescription: string | undefined): TaskRelevance | null {
  const query = taskDescription?.trim()
  if (!query) {
    return null
  }

  const rawTokens = query
    .toLowerCase()
    .split(/[^a-z0-9_/-]+/i)
    .map(token => token.trim())
    .filter(token => token.length >= 3)
  const splitTokens = rawTokens.flatMap(token =>
    token
      .split(/(?=[A-Z])|[_/-]/)
      .map(part => part.trim().toLowerCase())
      .filter(part => part.length >= 3),
  )
  const tokens = Array.from(new Set([...rawTokens, ...splitTokens])).slice(0, 12)

  if (tokens.length === 0) {
    return null
  }

  return { query, tokens }
}

function scoreTaskRelevance(
  normalizedFile: string,
  exports: string[],
  taskRelevance: TaskRelevance,
): { score: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []
  const loweredFile = normalizedFile.toLowerCase()
  const loweredExports = exports.map(name => name.toLowerCase())

  for (const token of taskRelevance.tokens) {
    if (loweredExports.some(name => name === token)) {
      score += 8
      reasons.push(`export:${token}`)
      continue
    }
    if (loweredExports.some(name => name.includes(token))) {
      score += 5
      reasons.push(`export~${token}`)
      continue
    }
    if (loweredFile.includes(token)) {
      score += 4
      reasons.push(`path:${token}`)
    }
  }

  return { score, reasons }
}

function dedupeReasons(reasons: string[]): string[] {
  return Array.from(new Set(reasons.filter(Boolean)))
}

function formatWorkspaceLabel(root: string): string {
  const cwd = getCwd()
  if (root === cwd) {
    return `cwd:${basename(root) || root}`
  }

  const relativePath = relative(cwd, root)
  if (relativePath && !relativePath.startsWith('..')) {
    return relativePath
  }

  return basename(root) || root
}

function toRelativeDisplayPath(root: string, target: string): string {
  const relativePath = relative(root, target)
  return relativePath || basename(target)
}

function normalizeRelativePath(path: string): string {
  return path.split(sep).join('/')
}

function dedupeRoots(roots: string[]): string[] {
  const MAX_ANCESTOR_DEPTH = 3
  const seen = new Set<string>()
  const ordered: string[] = []

  for (const root of roots) {
    const normalizedRoot = root.trim()
    let current = normalizedRoot
    if (!current) {
      continue
    }

    let depth = 0
    while (current && !seen.has(current)) {
      seen.add(current)
      ordered.push(current)

      const parent = dirname(current)
      if (parent === current) {
        break
      }
      if (depth >= MAX_ANCESTOR_DEPTH) {
        break
      }
      if (shouldStopAncestorScan(normalizedRoot, current)) {
        break
      }
      if (SCAN_STOP_NAMES.has(basename(current).toLowerCase())) {
        break
      }
      current = parent
      depth += 1
    }
  }

  return ordered
}

function shouldStopAncestorScan(root: string, current: string): boolean {
  const normalizedCurrent = current.toLowerCase()
  const normalizedRoot = root.toLowerCase()

  if (
    normalizedRoot.includes(`${sep}temp${sep}`) ||
    normalizedRoot.includes(`${sep}tmp${sep}`)
  ) {
    const parent = dirname(current).toLowerCase()
    return parent.endsWith(`${sep}temp`) || parent.endsWith(`${sep}tmp`)
  }

  return false
}
