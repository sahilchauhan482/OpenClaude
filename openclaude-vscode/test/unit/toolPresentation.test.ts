import { describe, expect, it } from 'vitest';
import {
  estimateToolDelta,
  extractFileEditHunks,
  getToolPresentation,
  parseReviewerToolResult,
  parseVerificationToolResult,
  shouldRenderToolResultAsCode,
} from '../../webview/src/utils/toolPresentation';

describe('toolPresentation', () => {
  it('formats bash tools as code-first command cards', () => {
    const presentation = getToolPresentation('Bash', {
      command: 'npm test -- --run test/unit/sessionDiscovery.test.ts',
    });

    expect(presentation.kind).toBe('command');
    expect(presentation.language).toBe('bash');
    expect(presentation.code).toContain('npm test');
    expect(presentation.summary).toContain('npm test');
  });

  it('extracts approximate line deltas for file edit tools', () => {
    expect(
      estimateToolDelta('FileEditTool', {
        old_string: 'alpha\nbeta\n',
        new_string: 'alpha\nbeta\ngamma\n',
      }),
    ).toEqual({
      additions: 3,
      deletions: 2,
      approximate: true,
    });
  });

  it('extracts diff hunks for multi-edit requests', () => {
    expect(
      extractFileEditHunks({
        edits: [
          { old_string: 'foo();', new_string: 'foo(1);' },
          { old_string: 'bar();', new_string: 'bar(2);' },
        ],
      }),
    ).toEqual([
      { removed: 'foo();', added: 'foo(1);' },
      { removed: 'bar();', added: 'bar(2);' },
    ]);
  });

  it('prefers code rendering for plain terminal output', () => {
    expect(
      shouldRenderToolResultAsCode('npm test\nPASS test/unit/example.test.ts\nDone in 1.2s'),
    ).toBe(true);

    expect(
      shouldRenderToolResultAsCode('- item one\n- item two'),
    ).toBe(false);
  });

  it('parses verifier verdict summaries for tool-result badges', () => {
    expect(
      parseVerificationToolResult(
        [
          '### Check: smoke',
          '**Command run:**',
          'npm test',
          'VERDICT: PASS',
        ].join('\n'),
      ),
    ).toEqual({
      verdict: 'PASS',
      checkCount: 1,
      commandBlockCount: 1,
      hasEvidence: true,
    });
  });

  it('marks weak verifier passes when evidence blocks are missing', () => {
    expect(
      parseVerificationToolResult('VERDICT: PASS'),
    ).toEqual({
      verdict: 'PASS',
      checkCount: 0,
      commandBlockCount: 0,
      hasEvidence: false,
    });
  });

  it('parses reviewer findings in severity-ranked format', () => {
    expect(
      parseReviewerToolResult(
        [
          '## Findings',
          '1. [high] src/query.ts:120',
          'Problem: completion gate skips failed verification',
          'Why it matters: the agent can falsely claim success',
          'Evidence: reproduced with failing verifier output',
          '## Open Questions',
        ].join('\n'),
      ),
    ).toEqual({
      hasFindings: true,
      findings: [
        {
          severity: 'high',
          location: 'src/query.ts:120',
          problem: 'completion gate skips failed verification',
          whyItMatters: 'the agent can falsely claim success',
          evidence: 'reproduced with failing verifier output',
        },
      ],
    });
  });

  it('summarizes generic read tools using the target file path', () => {
    const presentation = getToolPresentation('READ', {
      file_path: 'd:\\OpenClaude\\openclaude-cli\\package.json',
    });

    expect(presentation.title).toBe('Read');
    expect(presentation.summary).toBe('Reading package.json');
    expect(presentation.detail).toBe('d:\\OpenClaude\\openclaude-cli\\package.json');
  });

  it('summarizes skill tools without exposing raw internal jargon in the header', () => {
    const presentation = getToolPresentation('SKILL', {
      file_path: 'skills/security-scan/SKILL.md',
    });

    expect(presentation.title).toBe('Skill');
    expect(presentation.summary).toBe('Loading skill instructions');
  });
});
