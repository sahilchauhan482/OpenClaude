export interface ToolDeltaSummary {
  additions: number;
  deletions: number;
  approximate: boolean;
}

export interface FileEditHunk {
  removed: string;
  added: string;
}

export interface TodoItem {
  content: string;
  activeForm?: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface ToolPresentation {
  kind: 'command' | 'file' | 'search' | 'web' | 'agent' | 'todo' | 'generic';
  title: string;
  summary: string;
  detail?: string;
  code?: string;
  language?: string;
  filePath?: string;
  delta?: ToolDeltaSummary;
  hunks?: FileEditHunk[];
  todos?: TodoItem[];
  rawInput: string;
}

export interface VerificationToolResultSummary {
  verdict: 'PASS' | 'FAIL' | 'PARTIAL';
  checkCount: number;
  commandBlockCount: number;
  hasEvidence: boolean;
}

export interface ReviewerFindingSummary {
  severity: 'critical' | 'high' | 'medium' | 'low';
  location?: string;
  problem: string;
  whyItMatters?: string;
  evidence?: string;
}

export interface ReviewerToolResultSummary {
  findings: ReviewerFindingSummary[];
  hasFindings: boolean;
}

const FILE_EDIT_TOOL_NAMES = new Set([
  'write',
  'edit',
  'multiedit',
  'fileedittool',
  'filewritetool',
  'notebookedittool',
]);

const COMMAND_TOOL_PATTERNS = ['bash', 'terminal', 'execute', 'command', 'shell'];
const SEARCH_TOOL_PATTERNS = ['search', 'grep', 'glob', 'find', 'ripgrep'];
const WEB_TOOL_PATTERNS = ['web', 'browser', 'fetch', 'http'];
const DECISION_TOOL_PATTERNS = ['askuserquestion', 'requestuserinput', 'elicitation'];
const PLAN_TOOL_PATTERNS = ['todowrite', 'updateplan'];
const VERDICT_PATTERN = /VERDICT:\s*(PASS|FAIL|PARTIAL)\b/;
const CHECK_HEADING_PATTERN = /^### Check:/gm;
const COMMAND_BLOCK_PATTERN = /^\*\*Command run:\*\*/gm;

export function isCommandToolName(toolName: string): boolean {
  const normalized = toolName.toLowerCase();
  return COMMAND_TOOL_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function isFileEditToolName(toolName: string): boolean {
  return FILE_EDIT_TOOL_NAMES.has(toolName.toLowerCase());
}

export function extractToolCommand(input: Record<string, unknown>): string | undefined {
  return firstString(input, ['command', 'cmd', 'script']);
}

export function extractToolFilePath(input: Record<string, unknown>): string | undefined {
  return firstString(input, ['file_path', 'path', 'file', 'filename', 'target_path']);
}

export function guessLanguageFromPath(filePath?: string): string | undefined {
  if (!filePath) {
    return undefined;
  }

  const match = /\.([a-zA-Z0-9_-]+)$/.exec(filePath);
  if (!match) {
    return undefined;
  }

  const ext = match[1].toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    json: 'json',
    md: 'markdown',
    py: 'python',
    sh: 'bash',
    ps1: 'powershell',
    css: 'css',
    html: 'html',
    yml: 'yaml',
    yaml: 'yaml',
    rs: 'rust',
    go: 'go',
  };

  return map[ext] ?? ext;
}

export function formatToolDelta(delta?: ToolDeltaSummary | null): string {
  if (!delta) {
    return '';
  }

  const parts: string[] = [];
  if (delta.additions > 0) {
    parts.push(`${delta.approximate ? '~' : ''}+${delta.additions}`);
  }
  if (delta.deletions > 0) {
    parts.push(`${delta.approximate ? '~' : ''}-${delta.deletions}`);
  }
  return parts.join(' ');
}

export function estimateToolDelta(
  toolName: string,
  input: Record<string, unknown>,
): ToolDeltaSummary | null {
  if (!isFileEditToolName(toolName)) {
    return null;
  }

  if (Array.isArray(input.edits)) {
    let additions = 0;
    let deletions = 0;

    for (const edit of input.edits) {
      if (!edit || typeof edit !== 'object') {
        continue;
      }

      const record = edit as Record<string, unknown>;
      additions += countLines(typeof record.new_string === 'string' ? record.new_string : '');
      deletions += countLines(typeof record.old_string === 'string' ? record.old_string : '');
    }

    return additions > 0 || deletions > 0
      ? { additions, deletions, approximate: true }
      : null;
  }

  if (typeof input.old_string === 'string' || typeof input.new_string === 'string') {
    const additions = countLines(typeof input.new_string === 'string' ? input.new_string : '');
    const deletions = countLines(typeof input.old_string === 'string' ? input.old_string : '');
    return additions > 0 || deletions > 0
      ? { additions, deletions, approximate: true }
      : null;
  }

  if (typeof input.content === 'string' && input.content.trim()) {
    return {
      additions: countLines(input.content),
      deletions: 0,
      approximate: true,
    };
  }

  return null;
}

export function extractFileEditHunks(
  input: Record<string, unknown>,
  maxHunks = 3,
): FileEditHunk[] {
  if (Array.isArray(input.edits)) {
    return input.edits
      .flatMap((edit) => {
        if (!edit || typeof edit !== 'object') {
          return [];
        }

        const record = edit as Record<string, unknown>;
        const removed = typeof record.old_string === 'string' ? record.old_string : '';
        const added = typeof record.new_string === 'string' ? record.new_string : '';

        if (!removed && !added) {
          return [];
        }

        return [{ removed, added }];
      })
      .slice(0, maxHunks);
  }

  const removed = typeof input.old_string === 'string' ? input.old_string : '';
  const added = typeof input.new_string === 'string' ? input.new_string : '';

  if (!removed && !added) {
    return [];
  }

  return [{ removed, added }];
}

export function shouldRenderToolResultAsCode(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed || trimmed.includes('```')) {
    return false;
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return true;
  }

  if (/^(\$|>|\.\.|npm|pnpm|yarn|git|Error:|\s+at\s)/m.test(trimmed)) {
    return true;
  }

  const lineCount = trimmed.split(/\r?\n/).length;
  return lineCount >= 3;
}

export function parseVerificationToolResult(
  content: string,
): VerificationToolResultSummary | null {
  const verdictMatch = content.match(VERDICT_PATTERN);
  if (!verdictMatch?.[1]) {
    return null;
  }

  const verdict = verdictMatch[1] as VerificationToolResultSummary['verdict'];
  const checkCount = Array.from(content.matchAll(CHECK_HEADING_PATTERN)).length;
  const commandBlockCount = Array.from(content.matchAll(COMMAND_BLOCK_PATTERN)).length;

  return {
    verdict,
    checkCount,
    commandBlockCount,
    hasEvidence: checkCount > 0 && commandBlockCount >= checkCount,
  };
}

export function parseReviewerToolResult(
  content: string,
): ReviewerToolResultSummary | null {
  const findingsSection = content.match(/## Findings([\s\S]*?)(?:## Open Questions|## Residual Risk|$)/i);
  if (!findingsSection?.[1]) {
    return null;
  }

  const body = findingsSection[1].trim();
  if (!body) {
    return null;
  }

  if (/No actionable findings\./i.test(body)) {
    return { findings: [], hasFindings: false };
  }

  const blocks = body
    .split(/\n(?=\d+\.\s+\[(?:critical|high|medium|low)\])/i)
    .map((item) => item.trim())
    .filter(Boolean);

  const findings = blocks.flatMap((block) => {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const header = lines[0]?.match(/^\d+\.\s+\[(critical|high|medium|low)\]\s*(.+)?$/i);
    if (!header) {
      return [];
    }

    const severity = header[1].toLowerCase() as ReviewerFindingSummary['severity'];
    const location = header[2]?.trim() || undefined;
    const problem = extractPrefixedLine(lines, 'Problem:') ?? '';
    if (!problem) {
      return [];
    }

    return [{
      severity,
      location,
      problem,
      whyItMatters: extractPrefixedLine(lines, 'Why it matters:'),
      evidence: extractPrefixedLine(lines, 'Evidence:'),
    }];
  });

  return {
    findings,
    hasFindings: findings.length > 0,
  };
}

function extractPrefixedLine(lines: string[], prefix: string): string | undefined {
  const line = lines.find((entry) => entry.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : undefined;
}

export function getToolPresentation(
  toolName: string,
  input: Record<string, unknown>,
): ToolPresentation {
  const filePath = extractToolFilePath(input);
  const fileName = filePath ? getFileName(filePath) : undefined;
  const rawInput = safeJsonStringify(input);
  const normalized = toolName.toLowerCase();
  const decisionPrompt = extractDecisionPrompt(input);
  const planItems = extractPlanItems(input);

  if (isCommandToolName(toolName)) {
    const command = extractToolCommand(input);
    return {
      kind: 'command',
      title: 'Command',
      summary: command ? truncateSingleLine(command, 96) : 'Running command',
      detail: command ? `${countLines(command)} line command` : undefined,
      code: command,
      language: 'bash',
      rawInput,
    };
  }

  if (isFileEditToolName(toolName)) {
    const hunks = extractFileEditHunks(input);
    const content =
      typeof input.content === 'string' && input.content.trim().length > 0
        ? input.content
        : undefined;
    return {
      kind: 'file',
      title: 'File Edit',
      summary: fileName ? `Editing ${fileName}` : 'Editing file',
      detail: filePath,
      filePath,
      delta: estimateToolDelta(toolName, input) ?? undefined,
      hunks,
      code: hunks.length === 0 ? content : undefined,
      language: guessLanguageFromPath(filePath),
      rawInput,
    };
  }

  if (SEARCH_TOOL_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    const query = firstString(input, ['pattern', 'query', 'regex', 'glob']);
    return {
      kind: 'search',
      title: 'Search',
      summary: query ? truncateSingleLine(query, 96) : 'Searching',
      detail: filePath,
      code: query,
      language: 'text',
      rawInput,
    };
  }

  if (WEB_TOOL_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    const target = firstString(input, ['url', 'query', 'prompt']);
    return {
      kind: 'web',
      title: 'Web',
      summary: target ? truncateSingleLine(target, 96) : 'Fetching web content',
      rawInput,
    };
  }

  if (DECISION_TOOL_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    const optionCount = countDecisionOptions(input);
    return {
      kind: 'generic',
      title: 'Decision',
      summary: decisionPrompt
        ? truncateSingleLine(decisionPrompt, 96)
        : 'Waiting for user decision',
      detail:
        optionCount > 0
          ? `${optionCount} option${optionCount === 1 ? '' : 's'} prepared`
          : 'Waiting for user decision',
      code: rawInput === '{}' ? undefined : rawInput,
      language: rawInput === '{}' ? undefined : 'json',
      rawInput,
    };
  }

  if (PLAN_TOOL_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    const parsedTodos = extractTodoItems(input);
    const completed = parsedTodos.filter(t => t.status === 'completed').length;
    const inProgress = parsedTodos.filter(t => t.status === 'in_progress').length;
    const total = parsedTodos.length;

    let summary = 'Tracking work plan';
    if (total > 0) {
      const parts: string[] = [];
      if (completed > 0) parts.push(`${completed} done`);
      if (inProgress > 0) parts.push(`${inProgress} active`);
      const pending = total - completed - inProgress;
      if (pending > 0) parts.push(`${pending} pending`);
      summary = parts.join(' · ');
    }

    return {
      kind: 'todo',
      title: 'Progress',
      summary,
      detail: total > 0 ? `${completed}/${total} tasks completed` : undefined,
      todos: parsedTodos.length > 0 ? parsedTodos : undefined,
      code: rawInput === '{}' ? undefined : rawInput,
      language: rawInput === '{}' ? undefined : 'json',
      rawInput,
    };
  }

  if (normalized.includes('agent')) {
    const desc = typeof input.description === 'string' ? input.description.trim() : undefined;
    const agentType = typeof input.subagent_type === 'string' ? input.subagent_type.trim() : undefined;
    return {
      kind: 'agent' as const,
      title: agentType ? humanizeToolName(agentType) : 'Agent',
      summary: desc ? truncateSingleLine(desc, 96) : 'Running background agent',
      detail: agentType ? `Type: ${agentType}` : undefined,
      code: rawInput === '{}' ? undefined : rawInput,
      language: rawInput === '{}' ? undefined : 'json',
      rawInput,
    };
  }

  const genericTitle = humanizeToolName(toolName);
  if (filePath && fileName) {
    return {
      kind: 'generic',
      title: genericTitle,
      summary: summarizeGenericPathTool(normalized, fileName),
      detail: filePath,
      filePath,
      code: rawInput === '{}' ? undefined : rawInput,
      language: rawInput === '{}' ? undefined : 'json',
      rawInput,
    };
  }

  return {
    kind: 'generic',
    title: genericTitle,
    summary: Object.keys(input).length > 0 ? 'Inspect tool input' : 'No input',
    code: rawInput === '{}' ? undefined : rawInput,
    language: rawInput === '{}' ? undefined : 'json',
    rawInput,
  };
}

function firstString(input: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return undefined;
}

function firstNonEmptyString(values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return undefined;
}

function extractDecisionPrompt(input: Record<string, unknown>): string | undefined {
  const direct = firstString(input, ['question', 'prompt', 'message', 'header']);
  if (direct) {
    return direct;
  }

  const questions = input.questions;
  if (!Array.isArray(questions)) {
    return undefined;
  }

  for (const question of questions) {
    if (!question || typeof question !== 'object') {
      continue;
    }
    const record = question as Record<string, unknown>;
    const value = firstString(record, ['question', 'prompt', 'message', 'header']);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function countDecisionOptions(input: Record<string, unknown>): number {
  const directOptions = countOptions(input.options);
  if (directOptions > 0) {
    return directOptions;
  }

  const questions = input.questions;
  if (!Array.isArray(questions)) {
    return 0;
  }

  return questions.reduce((total, question) => {
    if (!question || typeof question !== 'object') {
      return total;
    }
    const record = question as Record<string, unknown>;
    return total + countOptions(record.options);
  }, 0);
}

function countOptions(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function extractPlanItems(input: Record<string, unknown>): string[] {
  const items: string[] = [];

  const todos = input.todos;
  if (Array.isArray(todos)) {
    for (const todo of todos) {
      if (!todo || typeof todo !== 'object') {
        continue;
      }
      const record = todo as Record<string, unknown>;
      const label = firstNonEmptyString([record.activeForm, record.content]);
      if (label) {
        items.push(label);
      }
    }
  }

  const plan = input.plan;
  if (Array.isArray(plan)) {
    for (const step of plan) {
      if (!step || typeof step !== 'object') {
        continue;
      }
      const record = step as Record<string, unknown>;
      const label = firstNonEmptyString([record.step, record.content, record.title]);
      if (label) {
        items.push(label);
      }
    }
  }

  return items;
}

function extractTodoItems(input: Record<string, unknown>): TodoItem[] {
  const todos = input.todos;
  if (!Array.isArray(todos)) return [];

  const items: TodoItem[] = [];
  for (const todo of todos) {
    if (!todo || typeof todo !== 'object') continue;
    const record = todo as Record<string, unknown>;
    const content = firstNonEmptyString([record.content, record.activeForm]);
    if (!content) continue;
    const status = typeof record.status === 'string'
      && ['pending', 'in_progress', 'completed'].includes(record.status)
      ? record.status as TodoItem['status']
      : 'pending';
    const activeForm = typeof record.activeForm === 'string' ? record.activeForm : undefined;
    items.push({ content, activeForm, status });
  }
  return items;
}

function countLines(value: string): number {
  if (!value) {
    return 0;
  }

  const normalized = value.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.length;
}

function safeJsonStringify(input: Record<string, unknown>): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function getFileName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || filePath;
}

function truncateSingleLine(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 3)}...`;
}

function humanizeToolName(toolName: string): string {
  const trimmed = toolName.trim();
  if (!trimmed) {
    return 'Tool';
  }

  return trimmed
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function summarizeGenericPathTool(normalizedToolName: string, fileName: string): string {
  if (normalizedToolName.includes('read') || normalizedToolName.includes('view')) {
    return `Reading ${fileName}`;
  }

  if (normalizedToolName.includes('skill')) {
    return 'Loading skill instructions';
  }

  if (normalizedToolName.includes('agent')) {
    return `Loading ${fileName}`;
  }

  return `${humanizeToolName(normalizedToolName)} ${fileName}`;
}
