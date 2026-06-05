export interface VerificationMeta {
  verdict: 'PASS' | 'FAIL' | 'PARTIAL';
  checkCount: number;
  commandBlockCount: number;
  hasEvidence: boolean;
}

export interface ReviewerFinding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  location?: string;
  problem: string;
  whyItMatters?: string;
  evidence?: string;
}

export interface ReviewerMeta {
  findings: ReviewerFinding[];
  hasFindings: boolean;
  openQuestions?: string[];
  residualRisks?: string[];
}

export interface ToolResultMeta {
  agentType?: string;
  verification?: VerificationMeta;
  reviewer?: ReviewerMeta;
}
