import { describe, expect, it } from 'vitest';
import { buildWorkspaceContextPrompt, resolveNearestGitRepositoryPath } from '../../src/context/workspaceContext';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

describe('workspaceContext', () => {
  it('includes a non-git warning when the workspace is not a git repository', () => {
    const prompt = buildWorkspaceContextPrompt({
      workspacePath: 'D:\\SKUVelocity',
      isGitRepository: false,
      attachmentNames: ['image.png'],
    });

    expect(prompt).toContain('Workspace context:');
    expect(prompt).toContain('- Workspace path: D:\\SKUVelocity');
    expect(prompt).toContain('- Git repository: no');
    expect(prompt).toContain('do not try to create agent worktrees');
    expect(prompt).toContain('- Attachments: image.png');
  });

  it('does not add the worktree warning when the workspace is git-backed', () => {
    const prompt = buildWorkspaceContextPrompt({
      workspacePath: 'D:\\SKUVelocity',
      gitRootPath: 'D:\\SKUVelocity\\SKUVelocityNew',
      isGitRepository: true,
    });

    expect(prompt).toContain('- Git repository: yes');
    expect(prompt).toContain('- Git repository root: D:\\SKUVelocity\\SKUVelocityNew');
    expect(prompt).not.toContain('do not try to create agent worktrees');
  });

  it('resolves the nearest git repository path from a nested workspace path', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openclaude-git-root-'));
    const nested = path.join(root, 'nested', 'project');
    await fs.mkdir(nested, { recursive: true });
    await fs.mkdir(path.join(root, '.git'));

    expect(resolveNearestGitRepositoryPath(path.join(nested, 'src'))).toBe(root);
  });

  it('returns undefined when no git repository exists in the parent chain', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openclaude-no-git-'));
    const nested = path.join(root, 'nested', 'project');
    await fs.mkdir(nested, { recursive: true });

    expect(resolveNearestGitRepositoryPath(nested)).toBeUndefined();
  });
});
