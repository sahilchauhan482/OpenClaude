import * as fs from 'node:fs';
import * as path from 'node:path';

export interface WorkspaceContextInfo {
  workspacePath?: string;
  gitRootPath?: string;
  activeFilePath?: string;
  activeFileSelection?: string;
  attachmentNames?: string[];
  isGitRepository?: boolean;
}

function formatLineRange(selection?: string): string {
  if (!selection) return '';
  return selection.startsWith('lines ') ? selection : `lines ${selection}`;
}

export function buildWorkspaceContextPrompt(info: WorkspaceContextInfo): string {
  const lines: string[] = ['Workspace context:'];
  const workspaceName = info.workspacePath ? path.basename(info.workspacePath) : '';
  const gitRootName = info.gitRootPath ? path.basename(info.gitRootPath) : '';

  if (workspaceName) {
    lines.push(`- Repository: ${workspaceName}`);
  }
  if (info.workspacePath) {
    lines.push(`- Workspace path: ${info.workspacePath}`);
  }
  if (info.gitRootPath && info.gitRootPath !== info.workspacePath) {
    lines.push(`- Git repository root: ${info.gitRootPath}`);
  } else if (gitRootName && !workspaceName) {
    lines.push(`- Git repository root: ${info.gitRootPath}`);
  }
  if (typeof info.isGitRepository === 'boolean') {
    lines.push(`- Git repository: ${info.isGitRepository ? 'yes' : 'no'}`);
    if (!info.isGitRepository) {
      lines.push('- This workspace is not a git repository; do not try to create agent worktrees.');
      lines.push('- Do not spawn agent subtrees/subagents that require git worktrees.');
      lines.push('- Work directly in the current directory and use the files provided here.');
    }
  }
  if (info.activeFilePath) {
    lines.push(`- Active file: ${info.activeFilePath}${formatLineRange(info.activeFileSelection) ? ` (${formatLineRange(info.activeFileSelection)})` : ''}`);
  }
  if (info.attachmentNames && info.attachmentNames.length > 0) {
    lines.push(`- Attachments: ${info.attachmentNames.join(', ')}`);
  }

  lines.push('- Use only the workspace context and attached files provided here.');
  lines.push('- Do not claim direct filesystem access outside the workspace context provided here.');
  lines.push('- If you need additional repository detail, ask for the exact file or folder rather than claiming direct filesystem access.');
  return lines.join('\n');
}

export function resolveNearestGitRepositoryPath(startPath: string | undefined): string | undefined {
  if (!startPath?.trim()) {
    return undefined;
  }

  let current = path.resolve(startPath);
  while (true) {
    if (isGitRepositoryPath(current)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function isGitRepositoryPath(workspacePath: string | undefined): boolean {
  if (!workspacePath?.trim()) {
    return false;
  }

  return fs.existsSync(path.join(workspacePath, '.git'));
}
