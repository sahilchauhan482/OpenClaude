// src/context/worktreeHooks.ts
// Ensures Claude Code has a local worktree hook that falls back gracefully when
// the workspace is not a git repository. This keeps agent worktree isolation
// from hard-failing in plain folders while preserving git worktrees when
// available.

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';

interface HookCommand {
  type: 'command';
  command: string;
}

interface HookGroup {
  hooks: HookCommand[];
}

interface WorktreeHookPaths {
  hooksDir: string;
  scriptPath: string;
  settingsPath: string;
}

function sanitizeWorktreeName(name: string): string {
  const trimmed = name.trim().replace(/^-+|-+$/g, '');
  const sanitized = trimmed
    .replace(/\s+/g, '-')
    .replace(/\//g, '-')
    .replace(/\.{2,}/g, '-')
    .replace(/[~^:?*[\]\\@{}<>]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^\.+|\.+$/g, '');

  if (/^-+$/.test(sanitized)) {
    return '';
  }

  return sanitized;
}

function deriveWorktreePath(repoRoot: string, worktreeName: string): string {
  return path.join(`${repoRoot}-worktrees`, worktreeName);
}

function buildWorktreeHookScript(): string {
  return String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function readInput() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function sanitizeWorktreeName(name) {
  const trimmed = String(name || '').trim().replace(/^-+|-+$/g, '');
  const sanitized = trimmed
    .replace(/\s+/g, '-')
    .replace(/\//g, '-')
    .replace(/\.{2,}/g, '-')
    .replace(/[~^:?*[\]\\@{}<>]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^\.+|\.+$/g, '');

  if (/^-+$/.test(sanitized)) {
    return '';
  }

  return sanitized;
}

function isGitRepo(dir) {
  try {
    const output = execFileSync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.trim() === 'true';
  } catch {
    return false;
  }
}

function worktreePathFor(repoRoot, worktreeName) {
  return path.join(repoRoot + '-worktrees', worktreeName);
}

function createWorktree(input) {
  const cwd = String(input.cwd || process.cwd());
  if (!isGitRepo(cwd)) {
    process.stdout.write(cwd);
    process.exit(0);
  }

  const worktreeName = sanitizeWorktreeName(input.name) || 'agent-worktree';
  const worktreePath = worktreePathFor(cwd, worktreeName);
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

  try {
    const list = execFileSync('git', ['-C', cwd, 'worktree', 'list', '--porcelain'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (list.includes('worktree ' + worktreePath)) {
      process.stdout.write(worktreePath);
      process.exit(0);
    }
  } catch {
    // Fall through to creation.
  }

  try {
    execFileSync('git', ['-C', cwd, 'worktree', 'add', worktreePath, '-b', worktreeName], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    try {
      execFileSync('git', ['-C', cwd, 'worktree', 'add', worktreePath, worktreeName], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      // Last resort: keep the session alive in the current folder.
      process.stdout.write(cwd);
      process.exit(0);
    }
  }

  process.stdout.write(worktreePath);
}

function removeWorktree(input) {
  const cwd = String(input.cwd || process.cwd());
  const worktreePath = String(input.worktree_path || input.worktreePath || '');
  if (!worktreePath || worktreePath === cwd || !isGitRepo(cwd)) {
    process.exit(0);
  }

  try {
    execFileSync('git', ['-C', cwd, 'worktree', 'remove', '--force', worktreePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    // Best-effort cleanup only.
  }
}

const input = readInput();
const mode = process.argv[2];

if (mode === 'create') {
  createWorktree(input);
  process.exit(0);
}

if (mode === 'remove') {
  removeWorktree(input);
  process.exit(0);
}

process.exit(0);
`;
}

function buildHookCommand(scriptPath: string, mode: 'create' | 'remove'): string {
  return `node "${scriptPath}" ${mode}`;
}

function buildHookGroups(scriptPath: string): Record<string, HookGroup[]> {
  return {
    WorktreeCreate: [
      {
        hooks: [
          {
            type: 'command',
            command: buildHookCommand(scriptPath, 'create'),
          },
        ],
      },
    ],
    WorktreeRemove: [
      {
        hooks: [
          {
            type: 'command',
            command: buildHookCommand(scriptPath, 'remove'),
          },
        ],
      },
    ],
  };
}

function mergeHookSettings(existingHooks: Record<string, unknown> | undefined, scriptPath: string): Record<string, unknown> {
  const nextHooks: Record<string, unknown> = { ...(existingHooks ?? {}) };
  const ours = buildHookGroups(scriptPath);

  for (const [eventName, groups] of Object.entries(ours)) {
    const currentGroups = Array.isArray(nextHooks[eventName]) ? [...(nextHooks[eventName] as HookGroup[])] : [];
    const hasExactHook = currentGroups.some((group) =>
      Array.isArray(group.hooks) &&
      group.hooks.some((hook) => hook?.type === 'command' && hook.command === groups[0].hooks[0].command),
    );

    if (!hasExactHook) {
      currentGroups.push(groups[0]);
      nextHooks[eventName] = currentGroups;
    }
  }

  return nextHooks;
}

export function getWorktreeHookPaths(workspacePath: string): WorktreeHookPaths {
  const hooksDir = path.join(workspacePath, '.claude', 'hooks');
  const scriptPath = path.join(hooksDir, 'openclaude-worktree-hook.cjs');
  const settingsPath = path.join(workspacePath, '.claude', 'settings.local.json');
  return { hooksDir, scriptPath, settingsPath };
}

export function buildWorktreeHookScriptContent(): string {
  return buildWorktreeHookScript();
}

export function buildWorktreeHookSettings(existing: Record<string, unknown> | undefined, scriptPath: string): Record<string, unknown> {
  const next = { ...(existing ?? {}) };
  next.hooks = mergeHookSettings(
    (existing?.hooks as Record<string, unknown> | undefined) ?? undefined,
    scriptPath,
  );
  return next;
}

export async function ensureWorktreeHookConfig(workspacePath: string): Promise<void> {
  const { hooksDir, scriptPath, settingsPath } = getWorktreeHookPaths(workspacePath);
  await fs.mkdir(hooksDir, { recursive: true });

  const scriptContent = buildWorktreeHookScriptContent();
  const existingScript = await fs.readFile(scriptPath, 'utf8').catch(() => undefined);
  if (existingScript !== scriptContent) {
    await fs.writeFile(scriptPath, scriptContent, 'utf8');
  }

  let existingSettings: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(settingsPath, 'utf8');
    existingSettings = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    existingSettings = {};
  }

  const nextSettings = buildWorktreeHookSettings(existingSettings, scriptPath);
  const nextJson = `${JSON.stringify(nextSettings, null, 2)}\n`;
  const currentJson = await fs.readFile(settingsPath, 'utf8').catch(() => undefined);
  if (currentJson !== nextJson) {
    await fs.writeFile(settingsPath, nextJson, 'utf8');
  }
}

export function isGitRepositoryPathSync(workspacePath: string): boolean {
  if (!workspacePath.trim()) {
    return false;
  }
  return fsSync.existsSync(path.join(workspacePath, '.git'));
}
