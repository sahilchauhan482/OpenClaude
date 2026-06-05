import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  collectJsonlFiles,
  inferTranscriptSessionId,
  workspacePathToClaudeProjectDir,
} from '../../src/session/sessionDiscovery';

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

  it('only trusts payload.id from session_meta entries', () => {
    expect(
      inferTranscriptSessionId(
        {
          type: 'response_item',
          payload: {
            id: 'message-id-that-is-not-the-session',
            type: 'message',
            role: 'assistant',
          },
        },
        'rollout-session-id',
      ),
    ).toBe('rollout-session-id');

    expect(
      inferTranscriptSessionId(
        {
          type: 'session_meta',
          payload: {
            id: 'actual-session-id',
          },
        },
        'rollout-session-id',
      ),
    ).toBe('actual-session-id');
  });
});
