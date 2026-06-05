import type { AgentToolResult } from './agentToolUtils.js'

export function getVerificationFollowupInstruction(
  verification: AgentToolResult['verification'],
): string | null {
  if (!verification) {
    return null
  }

  if (verification.verdict === 'FAIL') {
    return `Independent verification returned FAIL. Do NOT tell the user the task is complete. Fix the reported issues, rerun the verification agent, and only then report completion.`
  }

  if (verification.verdict === 'PARTIAL') {
    return `Independent verification returned PARTIAL. Do NOT claim full completion. Clearly separate what was verified from what could not be verified, or continue verification if the missing environment/tools can be restored.`
  }

  if (!verification.hasEvidence) {
    return `Independent verification returned PASS but did not include enough command evidence. Treat it as incomplete verification: rerun the verification agent or manually verify before claiming completion.`
  }

  return `Independent verification returned PASS with command-backed evidence. You may proceed, but keep your summary scoped to what was actually verified.`
}
