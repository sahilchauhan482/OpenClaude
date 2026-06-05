import { describe, expect, it } from 'vitest';
import {
  applyAgentTeamEvent,
  buildAgentTeamEnv,
  buildAgentTeamPrompt,
  createAgentTeamBoardState,
} from '../../src/agentTeams/policy';

describe('agent team policy', () => {
  it('flags duplicate running tasks and delegation budget overflow', () => {
    let state = createAgentTeamBoardState(
      { mode: 'assist', maxWorkers: 1, useWorktrees: false },
      { worktreeAvailable: false, currentWorktreeName: null },
    );

    state = applyAgentTeamEvent(state, {
      type: 'system',
      subtype: 'task_started',
      task_id: 't1',
      description: 'Investigate failing tests',
      uuid: 'u1',
      session_id: 's1',
    });
    state = applyAgentTeamEvent(state, {
      type: 'system',
      subtype: 'task_started',
      task_id: 't2',
      description: 'Investigate failing tests',
      uuid: 'u2',
      session_id: 's1',
    });

    expect(state.runningTaskCount).toBe(2);
    expect(state.tasks.filter((task) => task.duplicateDescription)).toHaveLength(2);
    expect(state.warnings.some((warning) => warning.includes('Delegation budget exceeded'))).toBe(true);
    expect(state.warnings.some((warning) => warning.includes('duplicate delegation'))).toBe(true);
  });

  it('warns about overlapping write-heavy tasks without worktrees', () => {
    let state = createAgentTeamBoardState(
      { mode: 'coordinate', maxWorkers: 4, useWorktrees: false },
      { worktreeAvailable: false, currentWorktreeName: null },
    );

    state = applyAgentTeamEvent(state, {
      type: 'system',
      subtype: 'task_started',
      task_id: 't1',
      description: 'Implement chat task board',
      uuid: 'u1',
      session_id: 's1',
    });
    state = applyAgentTeamEvent(state, {
      type: 'system',
      subtype: 'task_started',
      task_id: 't2',
      description: 'Refactor session resume wiring',
      uuid: 'u2',
      session_id: 's1',
    });

    expect(state.warnings.some((warning) => warning.includes('conflicting edits'))).toBe(true);
  });

  it('aggregates progress, completion, and post-turn summaries', () => {
    let state = createAgentTeamBoardState(
      { mode: 'assist', maxWorkers: 3, useWorktrees: true },
      { worktreeAvailable: true, currentWorktreeName: 'feature-agent-board' },
    );

    state = applyAgentTeamEvent(state, {
      type: 'system',
      subtype: 'task_started',
      task_id: 't1',
      description: 'Review failing replay flow',
      task_type: 'analysis',
      workflow_name: 'reviewer',
      uuid: 'u1',
      session_id: 's1',
    });
    state = applyAgentTeamEvent(state, {
      type: 'system',
      subtype: 'task_progress',
      task_id: 't1',
      description: 'Review failing replay flow',
      usage: { total_tokens: 340, tool_uses: 5, duration_ms: 2200 },
      last_tool_name: 'Read',
      summary: 'Checked session rebinding path',
      uuid: 'u2',
      session_id: 's1',
    });
    state = applyAgentTeamEvent(state, {
      type: 'system',
      subtype: 'task_notification',
      task_id: 't1',
      status: 'completed',
      output_file: 'worker-output.md',
      summary: 'Replay bug isolated to stale parent id mapping',
      usage: { total_tokens: 550, tool_uses: 8, duration_ms: 3600 },
      uuid: 'u3',
      session_id: 's1',
    });
    state = applyAgentTeamEvent(state, {
      type: 'system',
      subtype: 'post_turn_summary',
      summarizes_uuid: 'sum-1',
      status_category: 'review_ready',
      status_detail: 'ready',
      is_noteworthy: true,
      title: 'Replay flow review',
      description: 'Parent agent now has enough evidence to patch the resume path.',
      recent_action: 'Compared worker findings against session tracker behavior.',
      needs_action: 'Patch parent conversation binding and rerun resume tests.',
      artifact_urls: [],
      uuid: 'u4',
      session_id: 's1',
    });

    expect(state.tasks[0]?.status).toBe('completed');
    expect(state.tasks[0]?.toolUses).toBe(8);
    expect(state.tasks[0]?.summary).toContain('Replay bug isolated');
    expect(state.summaries[0]?.statusCategory).toBe('review_ready');
    expect(state.summaries[0]?.needsAction).toContain('Patch parent conversation binding');
  });

  it('builds env and prompt for enabled agent-team mode', () => {
    const env = buildAgentTeamEnv({
      mode: 'coordinate',
      maxWorkers: 4,
      useWorktrees: true,
    });
    const prompt = buildAgentTeamPrompt(
      { mode: 'coordinate', maxWorkers: 4, useWorktrees: true },
      { worktreeAvailable: true, currentWorktreeName: 'feature-agent-board' },
    );

    expect(env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe('1');
    expect(env.CLAUDE_CODE_COORDINATOR_MODE).toBe('1');
    expect(prompt).toContain('Hard delegation budget: launch at most 4 concurrent worker tasks');
    expect(prompt).toContain('feature-agent-board');
  });
});
