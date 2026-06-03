import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { collectJsonlFiles, workspacePathToClaudeProjectDir } from '../../src/session/sessionDiscovery';

describe('sessionDiscovery', () => {
  it('normalizes Windows workspace paths to Claude project directory names', () => {
    expect(workspacePathToClaudeProjectDir('D:\\SKUVelocity')).toBe('D--SKUVelocity');
    expect(workspacePathToClaudeProjectDir('C:\\WINDOWS\\system32')).toBe('C--WINDOWS-system32');
  });

  it('collects jsonl files recursively from nested session directories', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaude-scan-'));
    const nested = path.join(root, '2026', '06', '01');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(root, 'top.jsonl'), '');
    fs.writeFileSync(path.join(nested, 'deep.jsonl'), '');
    fs.writeFileSync(path.join(nested, 'ignore.txt'), '');

    expect(collectJsonlFiles(root).map((file) => path.basename(file)).sort()).toEqual([
      'deep.jsonl',
      'top.jsonl',
    ]);
  });
});
