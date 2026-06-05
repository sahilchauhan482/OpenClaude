import React, { useState } from 'react';
import type { ToolResultBlock } from '../../types/blocks';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import { CodeBlock } from '../shared/CodeBlock';
import {
  parseReviewerToolResult,
  parseVerificationToolResult,
  shouldRenderToolResultAsCode,
} from '../../utils/toolPresentation';
import type { ReviewerFinding, ReviewerMeta, VerificationMeta } from '../../types/toolResultMeta';

interface ToolResultBlockProps {
  block: ToolResultBlock;
  isStreaming: boolean;
}

export function ToolResultBlockRenderer({ block, isStreaming }: ToolResultBlockProps) {
  const [isExpanded, setIsExpanded] = useState(block.is_error || block.content.length <= 600);
  const hasContent = block.content.trim().length > 0;
  const renderAsCode = shouldRenderToolResultAsCode(block.content);
  const verification = block.meta?.verification ?? parseVerificationToolResult(block.content) ?? undefined;
  const reviewer = block.meta?.reviewer ?? parseReviewerToolResult(block.content) ?? undefined;
  const shouldShowStructuredSummary = Boolean(
    (!isStreaming && verification) ||
    (!isStreaming && reviewer),
  );

  return (
    <div className={`tool-result-card ${block.is_error ? 'tool-result-card-error' : ''}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="tool-result-button"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`tool-call-chevron ${isExpanded ? 'rotate-90' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>

        <ToolResultIcon />

        <span className="tool-result-title">
          {reviewer ? 'Review result' : verification ? 'Verification result' : 'Tool result'}
        </span>

        {block.is_error ? (
          <span className="tool-result-status tool-result-status-error">Error</span>
        ) : reviewer && !isStreaming ? (
          <>
            <span
              className={`tool-result-verdict ${reviewer.hasFindings ? 'tool-result-verdict-fail' : 'tool-result-verdict-pass'}`}
              title={reviewer.hasFindings ? 'The reviewer found issues that may need attention' : 'No actionable issues found during review'}
            >
              {reviewer.hasFindings ? 'Findings' : 'Clean review'}
            </span>
            <span className="tool-result-meta" title={reviewer.hasFindings ? 'Number of severity-ranked issues the reviewer identified' : 'The reviewer did not flag any actionable problems'}>
              {reviewer.hasFindings ? `${reviewer.findings.length} issues flagged` : 'No actionable findings'}
            </span>
          </>
        ) : verification && !isStreaming ? (
          <>
            <span
              className={`tool-result-verdict tool-result-verdict-${verification.verdict.toLowerCase()}`}
              title={{
                PASS: 'All verification checks passed',
                FAIL: 'Verification found issues that need fixing before completion',
                PARTIAL: 'Some checks passed but verification is incomplete',
              }[verification.verdict] ?? 'Verification result'}
            >
              {verification.verdict}
            </span>
            <span
              className="tool-result-meta"
              title={verification.hasEvidence
                ? 'The verifier included command output to back up its conclusions'
                : 'The verifier did not include enough command output to prove its conclusions'}
            >
              {verification.checkCount > 0
                ? `${verification.checkCount} checks`
                : 'Verifier report'}
              {verification.hasEvidence ? ' · evidence logged' : ' · evidence incomplete'}
            </span>
          </>
        ) : (
          <span className={`tool-result-status ${isStreaming ? 'tool-result-status-live' : ''}`}>
            {isStreaming ? 'Running' : 'Completed'}
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="tool-result-expanded">
          {shouldShowStructuredSummary ? (
            <StructuredToolSummary verification={verification} reviewer={reviewer} />
          ) : null}
          {hasContent ? (
            renderAsCode ? (
              <CodeBlock language="text">
                {block.content}
              </CodeBlock>
            ) : (
              <MarkdownRenderer content={block.content} />
            )
          ) : (
            <div style={{ fontSize: 11, opacity: 0.4, fontStyle: 'italic' }}>No output</div>
          )}
        </div>
      )}
    </div>
  );
}

function StructuredToolSummary({
  verification,
  reviewer,
}: {
  verification?: VerificationMeta;
  reviewer?: ReviewerMeta;
}) {
  if (reviewer) {
    return (
      <div className="tool-result-structured">
        <div className="tool-result-section">
          <div className="tool-result-section-title">Review summary</div>
          <div className="tool-result-section-body">
            {reviewer.hasFindings
              ? `${reviewer.findings.length} severity-ranked findings captured.`
              : 'No actionable findings.'}
          </div>
        </div>
        {reviewer.findings.length > 0 ? (
          <ReviewerFindings findings={reviewer.findings} />
        ) : null}
        {reviewer.openQuestions?.length ? (
          <SectionList title="Open questions" items={reviewer.openQuestions} />
        ) : null}
        {reviewer.residualRisks?.length ? (
          <SectionList title="Residual risk" items={reviewer.residualRisks} />
        ) : null}
      </div>
    );
  }

  if (verification) {
    return (
      <div className="tool-result-structured">
        <div className="tool-result-section">
          <div className="tool-result-section-title">Verification summary</div>
          <div className="tool-result-section-body">
            {verification.verdict} · {verification.checkCount > 0
              ? `${verification.checkCount} checks`
              : 'Verifier report'}
            {verification.hasEvidence ? ' · command-backed evidence' : ' · evidence incomplete'}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function ReviewerFindings({ findings }: { findings: ReviewerFinding[] }) {
  return (
    <div className="tool-reviewer-findings tool-result-section">
      <div className="tool-result-section-title">Findings</div>
      {findings.slice(0, 4).map((finding, index) => (
        <div
          key={`${finding.severity}-${finding.location ?? index}`}
          className="tool-reviewer-finding"
        >
          <div className="tool-reviewer-finding-header">
            <span className={`tool-reviewer-severity tool-reviewer-severity-${finding.severity}`}>
              {finding.severity}
            </span>
            {finding.location ? (
              <span className="tool-reviewer-location">{finding.location}</span>
            ) : null}
          </div>
          <div className="tool-reviewer-problem">{finding.problem}</div>
          {finding.whyItMatters ? (
            <div className="tool-reviewer-detail">Why it matters: {finding.whyItMatters}</div>
          ) : null}
          {finding.evidence ? (
            <div className="tool-reviewer-detail">Evidence: {finding.evidence}</div>
          ) : null}
        </div>
      ))}
      {findings.length > 4 ? (
        <div style={{ fontSize: 11, opacity: 0.6, padding: '6px 0 2px', fontStyle: 'italic' }}>
          + {findings.length - 4} more {findings.length - 4 === 1 ? 'finding' : 'findings'} in full output below
        </div>
      ) : null}
    </div>
  );
}

function SectionList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="tool-result-section">
      <div className="tool-result-section-title">{title}</div>
      <ul className="tool-result-bullets">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ToolResultIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="opacity-60"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
