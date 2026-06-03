import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('worktreeHooks', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (!dir) continue;
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it('builds a local hook script that includes create and remove modes', async () => {
    const { buildWorktreeHookScriptContent } = await import('../../src/context/worktreeHooks');

    const script = buildWorktreeHookScriptContent();

    expect(script).toContain('function createWorktree(input)');
    expect(script).toContain('function removeWorktree(input)');
    expect(script).toContain('process.stdout.write(cwd);');
    expect(script).toContain("'worktree', 'add'");
  });

  it('merges worktree hooks without dropping existing settings', async () => {
    const { buildWorktreeHookSettings } = await import('../../src/context/worktreeHooks');

    const settings = buildWorktreeHookSettings(
      {
        model: 'gpt-5.5',
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo ok' }] }],
        },
      },
      'C:/temp/openclaude-worktree-hook.cjs',
    );

    expect(settings.model).toBe('gpt-5.5');
    expect(settings.hooks).toBeDefined();
    expect((settings.hooks as Record<string, unknown>).PreToolUse).toBeDefined();
    expect((settings.hooks as Record<string, unknown>).WorktreeCreate).toBeDefined();
    expect((settings.hooks as Record<string, unknown>).WorktreeRemove).toBeDefined();
  });

  it('creates the local hook files inside .claude', async () => {
    const { ensureWorktreeHookConfig, getWorktreeHookPaths } = await import('../../src/context/worktreeHooks');

    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openclaude-worktree-hooks-'));
    tempDirs.push(root);

    await ensureWorktreeHookConfig(root);

    const { hooksDir, scriptPath, settingsPath } = getWorktreeHookPaths(root);
    const script = await fs.readFile(scriptPath, 'utf8');
    const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as Record<string, unknown>;

    expect(await fs.stat(hooksDir)).toBeDefined();
    expect(script).toContain('createWorktree');
    expect(script).toContain('removeWorktree');
    expect(settings.hooks).toBeDefined();
    expect((settings.hooks as Record<string, unknown>).WorktreeCreate).toBeDefined();
    expect((settings.hooks as Record<string, unknown>).WorktreeRemove).toBeDefined();
  });
});
