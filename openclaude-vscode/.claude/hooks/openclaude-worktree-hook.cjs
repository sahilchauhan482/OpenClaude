#!/usr/bin/env node
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
