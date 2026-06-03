// src/diff/diffManager.ts
// Orchestrates the full diff lifecycle: intercept file-edit tool_use
// permission requests, show VS Code native diff, handle accept/reject,
// write files, and send control_response back to the CLI.

import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { DiffContentProvider } from './diffContentProvider';
import type { NdjsonTransport } from '../process/ndjsonTransport';
import type { ControlRequestPermission } from '../types/messages';

/**
 * Represents a single pending diff waiting for user decision.
 */
interface PendingDiff {
  /** Absolute path to the file being edited */
  filePath: string;
  /** The original file content (before edit) */
  originalContent: string;
  /** The proposed file content (after edit) */
  proposedContent: string;
  /** The request_id from the control_request -- needed for control_response */
  requestId: string;
  /** The tool_use_id from the control_request */
  toolUseId: string;
  /** The tool name (FileEditTool or FileWriteTool) */
  toolName: string;
  /** The full tool input for passing back in updatedInput on accept */
  toolInput: Record<string, unknown>;
  /** The transport to send the control_response on */
  transport: NdjsonTransport;
}

const FILE_EDIT_TOOL_NAMES = new Set([
  'Write',
  'Edit',
  'MultiEdit',
  'FileEditTool',
  'FileWriteTool',
  'NotebookEditTool',
]);

export interface DiffChangeSummary {
  additions: number;
  deletions: number;
}

export interface DiffPreview {
  contextBefore: string[];
  removed: string[];
  added: string[];
  contextAfter: string[];
  truncated: boolean;
}

export interface DiffStatusEvent {
  stage: 'reviewing' | 'applied' | 'rejected';
  filePath: string;
  fileName: string;
  toolName: string;
  additions: number;
  deletions: number;
  preview: DiffPreview;
}

export function summarizeLineChanges(
  originalContent: string,
  proposedContent: string,
): DiffChangeSummary {
  if (originalContent === proposedContent) {
    return { additions: 0, deletions: 0 };
  }

  const originalLines = splitIntoLines(originalContent);
  const proposedLines = splitIntoLines(proposedContent);

  let prefix = 0;
  while (
    prefix < originalLines.length &&
    prefix < proposedLines.length &&
    originalLines[prefix] === proposedLines[prefix]
  ) {
    prefix++;
  }

  let originalSuffix = originalLines.length - 1;
  let proposedSuffix = proposedLines.length - 1;
  while (
    originalSuffix >= prefix &&
    proposedSuffix >= prefix &&
    originalLines[originalSuffix] === proposedLines[proposedSuffix]
  ) {
    originalSuffix--;
    proposedSuffix--;
  }

  return {
    additions: Math.max(0, proposedSuffix - prefix + 1),
    deletions: Math.max(0, originalSuffix - prefix + 1),
  };
}

function splitIntoLines(content: string): string[] {
  if (!content) {
    return [];
  }

  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

export function buildDiffPreview(
  originalContent: string,
  proposedContent: string,
  options: {
    contextLines?: number;
    maxPreviewLines?: number;
  } = {},
): DiffPreview {
  const contextLines = options.contextLines ?? 2;
  const maxPreviewLines = options.maxPreviewLines ?? 60;
  const originalLines = splitIntoLines(originalContent);
  const proposedLines = splitIntoLines(proposedContent);

  let prefix = 0;
  while (
    prefix < originalLines.length &&
    prefix < proposedLines.length &&
    originalLines[prefix] === proposedLines[prefix]
  ) {
    prefix++;
  }

  let originalSuffix = originalLines.length - 1;
  let proposedSuffix = proposedLines.length - 1;
  while (
    originalSuffix >= prefix &&
    proposedSuffix >= prefix &&
    originalLines[originalSuffix] === proposedLines[proposedSuffix]
  ) {
    originalSuffix--;
    proposedSuffix--;
  }

  const contextBefore = originalLines.slice(
    Math.max(0, prefix - contextLines),
    prefix,
  );
  const removed = originalLines.slice(prefix, originalSuffix + 1);
  const added = proposedLines.slice(prefix, proposedSuffix + 1);
  const contextAfter = originalLines.slice(
    originalSuffix + 1,
    Math.min(originalLines.length, originalSuffix + 1 + contextLines),
  );

  const totalLines =
    contextBefore.length +
    removed.length +
    added.length +
    contextAfter.length;

  if (totalLines <= maxPreviewLines) {
    return {
      contextBefore,
      removed,
      added,
      contextAfter,
      truncated: false,
    };
  }

  const contextBudget = contextBefore.length + contextAfter.length;
  const remainingBudget = Math.max(0, maxPreviewLines - contextBudget);
  const removedBudget = Math.min(
    removed.length,
    Math.max(1, Math.floor(remainingBudget / 2)),
  );
  const addedBudget = Math.min(
    added.length,
    Math.max(1, remainingBudget - removedBudget),
  );

  return {
    contextBefore,
    removed: removed.slice(0, removedBudget),
    added: added.slice(0, addedBudget),
    contextAfter,
    truncated: true,
  };
}

export class DiffManager implements vscode.Disposable {
  /** Pending diffs keyed by normalized file path. One per file at a time. */
  private readonly pendingDiffs = new Map<string, PendingDiff>();

  /** Queue for diffs arriving while another diff for the same file is pending */
  private readonly pendingQueue = new Map<
    string,
    Array<{
      requestId: string;
      request: ControlRequestPermission;
      transport: NdjsonTransport;
    }>
  >();

  /** Track which diff editor tabs we opened, keyed by file path */
  private readonly diffEditorTabs = new Map<string, vscode.Uri>();

  private readonly disposables: vscode.Disposable[] = [];
  private statusReporter?: (event: DiffStatusEvent) => void;

  /** Max file size (in bytes) for diff preview -- skip diff for huge files */
  private static readonly MAX_DIFF_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

  constructor(
    private readonly originalProvider: DiffContentProvider,
    private readonly proposedProvider: DiffContentProvider,
    private readonly outputChannel: vscode.OutputChannel,
  ) {
    // Listen for tab close events to clean up if user manually closes a diff
    this.disposables.push(
      vscode.window.tabGroups.onDidChangeTabs((event) => {
        this.handleTabClose(event);
      }),
    );
  }

  setStatusReporter(reporter: ((event: DiffStatusEvent) => void) | undefined): void {
    this.statusReporter = reporter;
  }

  /**
   * Check if a control_request is a file-edit tool_use that should show a diff.
   * Returns true for FileEditTool and FileWriteTool.
   */
  isFileEditToolRequest(request: ControlRequestPermission): boolean {
    const toolName = request.tool_name;
    return FILE_EDIT_TOOL_NAMES.has(toolName);
  }

  /**
   * Handle a can_use_tool control_request for a file-editing tool.
   * Reads original content, computes proposed content, opens the diff editor.
   *
   * @param requestId The control_request request_id
   * @param request The can_use_tool request inner payload
   * @param transport The NDJSON transport for sending control_response back
   */
  async showDiff(
    requestId: string,
    request: ControlRequestPermission,
    transport: NdjsonTransport,
  ): Promise<void> {
    const input = request.input;
    const filePath = this.resolveFilePath(input);

    if (!filePath) {
      this.outputChannel.appendLine(
        `[DiffManager] No file_path in tool input for ${request.tool_name}, auto-allowing`,
      );
      this.sendAllowResponse(requestId, request.tool_use_id, input, transport);
      return;
    }

    const normalizedPath = path.resolve(filePath);

    // If there's already a pending diff for this file, queue the new request
    if (this.pendingDiffs.has(normalizedPath)) {
      this.outputChannel.appendLine(
        `[DiffManager] Queuing edit for ${normalizedPath} (already reviewing)`,
      );
      if (!this.pendingQueue.has(normalizedPath)) {
        this.pendingQueue.set(normalizedPath, []);
      }
      this.pendingQueue.get(normalizedPath)!.push({
        requestId,
        request,
        transport,
      });
      return;
    }

    // Check file size -- skip diff for very large files
    try {
      const stat = await fs.stat(normalizedPath);
      if (stat.size > DiffManager.MAX_DIFF_FILE_SIZE) {
        this.outputChannel.appendLine(
          `[DiffManager] File too large for diff preview (${stat.size} bytes), auto-allowing`,
        );
        this.sendAllowResponse(
          requestId,
          request.tool_use_id,
          input,
          transport,
        );
        return;
      }
    } catch {
      // File doesn't exist (new file creation) -- OK, continue
    }

    try {
      // 1. Read original file content (empty string for new files)
      const originalContent = await this.readOriginalContent(normalizedPath);

      // 2. Compute proposed content
      const proposedContent = this.computeProposedContent(
        request.tool_name,
        input,
        originalContent,
      );

      // 3. Store in content providers
      this.originalProvider.setContent(normalizedPath, originalContent);
      this.proposedProvider.setContent(normalizedPath, proposedContent);

      // 4. Create the pending diff entry
      const pending: PendingDiff = {
        filePath: normalizedPath,
        originalContent,
        proposedContent,
        requestId,
        toolUseId: request.tool_use_id,
        toolName: request.tool_name,
        toolInput: input,
        transport,
      };
      this.pendingDiffs.set(normalizedPath, pending);
      this.emitStatus('reviewing', pending);

      // 5. Open VS Code native diff editor
      await this.openDiffEditor(normalizedPath, request.tool_name);

      // 6. Set context variable for button visibility
      await this.updateContextVariable();

      this.outputChannel.appendLine(
        `[DiffManager] Showing diff for ${normalizedPath} (${request.tool_name})`,
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(
        `[DiffManager] Error showing diff: ${errorMsg}`,
      );
      // On error, auto-allow so the CLI isn't stuck waiting
      this.sendAllowResponse(requestId, request.tool_use_id, input, transport);
    }
  }

  /**
   * Accept the currently active diff -- apply changes and notify CLI.
   * Called by the openclaude.acceptProposedDiff command.
   */
  async acceptCurrentDiff(): Promise<void> {
    const pending = this.getActivePendingDiff();
    if (!pending) {
      vscode.window.showWarningMessage('No pending diff to accept.');
      return;
    }

    // Workspace trust check
    if (!vscode.workspace.isTrusted) {
      vscode.window.showWarningMessage(
        'Cannot apply changes: workspace is not trusted. Trust the workspace first.',
      );
      return;
    }

    try {
      // 1. Write proposed content to disk
      await this.writeFile(pending.filePath, pending.proposedContent);

      // 2. Auto-save the file if it's open in an editor
      await this.autoSaveFile(pending.filePath);

      // 3. Send allow control_response to CLI
      this.sendAllowResponse(
        pending.requestId,
        pending.toolUseId,
        pending.toolInput,
        pending.transport,
      );
      this.emitStatus('applied', pending);

      this.outputChannel.appendLine(
        `[DiffManager] Accepted diff for ${pending.filePath}`,
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(
        `[DiffManager] Error accepting diff: ${errorMsg}`,
      );
      vscode.window.showErrorMessage(
        `Failed to apply changes: ${errorMsg}`,
      );
      return; // Don't clean up on write failure -- let user retry
    }

    // 4. Close diff editor and clean up
    await this.closeDiffAndCleanup(pending.filePath);
  }

  /**
   * Reject the currently active diff -- discard changes and notify CLI.
   * Called by the openclaude.rejectProposedDiff command.
   */
  async rejectCurrentDiff(): Promise<void> {
    const pending = this.getActivePendingDiff();
    if (!pending) {
      vscode.window.showWarningMessage('No pending diff to reject.');
      return;
    }

    // 1. Send deny control_response to CLI
    this.sendDenyResponse(
      pending.requestId,
      pending.toolUseId,
      'User rejected proposed changes',
      pending.transport,
    );
    this.emitStatus('rejected', pending);

    this.outputChannel.appendLine(
      `[DiffManager] Rejected diff for ${pending.filePath}`,
    );

    // 2. Close diff editor and clean up
    await this.closeDiffAndCleanup(pending.filePath);
  }

  /**
   * Cancel a pending diff (e.g., when CLI sends control_cancel_request).
   */
  async cancelDiffByRequestId(requestId: string): Promise<void> {
    for (const [filePath, pending] of this.pendingDiffs.entries()) {
      if (pending.requestId === requestId) {
        this.outputChannel.appendLine(
          `[DiffManager] Cancelling diff for ${filePath} (request ${requestId})`,
        );
        await this.closeDiffAndCleanup(filePath);
        return;
      }
    }
  }

  /**
   * Get the count of pending diffs (for status display).
   */
  get pendingCount(): number {
    return this.pendingDiffs.size;
  }

  // ===========================================================================
  // Private: Content computation
  // ===========================================================================

  /**
   * Read the original file content from disk.
   * Returns empty string if the file doesn't exist (new file creation).
   * Handles UTF-8 BOM markers.
   */
  private async readOriginalContent(filePath: string): Promise<string> {
    try {
      const buffer = await fs.readFile(filePath);
      // Handle UTF-8 BOM (0xEF 0xBB 0xBF)
      if (
        buffer.length >= 3 &&
        buffer[0] === 0xef &&
        buffer[1] === 0xbb &&
        buffer[2] === 0xbf
      ) {
        return buffer.toString('utf-8').slice(1); // Remove BOM character
      }
      return buffer.toString('utf-8');
    } catch {
      // File doesn't exist -- this is a new file creation
      return '';
    }
  }

  /**
   * Compute the proposed file content based on the tool type and input.
   *
   * FileWriteTool: The `content` field IS the new file content.
   * FileEditTool: Apply `old_string` -> `new_string` replacement on original.
   */
  computeProposedContent(
    toolName: string,
    input: Record<string, unknown>,
    originalContent: string,
  ): string {
    if (this.isWriteTool(toolName)) {
      // FileWriteTool has a `content` field with the full new file content
      return (input.content as string) ?? '';
    }

    if (this.isEditTool(toolName)) {
      const multiEdits = this.extractMultiEdits(input);
      if (multiEdits.length > 0) {
        return this.applySequentialEdits(originalContent, multiEdits);
      }

      // Edit-style tools typically use `old_string` and `new_string`.
      const oldString = (input.old_string as string) ?? '';
      const newString = (input.new_string as string) ?? '';

      if (oldString === '' && typeof input.content === 'string') {
        return input.content;
      }

      if (oldString === '') {
        // Empty old_string with empty original = create new file
        if (originalContent === '') {
          return newString;
        }
        // Empty old_string with existing content = shouldn't happen, but
        // treat as prepend for safety
        return newString + originalContent;
      }

      return this.applySingleEdit(originalContent, oldString, newString);
    }

    // Unknown tool -- return original unchanged
    this.outputChannel.appendLine(
      `[DiffManager] Unknown tool ${toolName}, returning original content`,
    );
    return originalContent;
  }

  private isWriteTool(toolName: string): boolean {
    return toolName === 'Write' || toolName === 'FileWriteTool' || toolName === 'NotebookEditTool';
  }

  private isEditTool(toolName: string): boolean {
    return toolName === 'Edit' || toolName === 'MultiEdit' || toolName === 'FileEditTool';
  }

  private resolveFilePath(input: Record<string, unknown>): string | undefined {
    const candidates = [
      input.file_path,
      input.path,
      input.file,
      input.filename,
      input.target_path,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }

    return undefined;
  }

  private applySingleEdit(originalContent: string, oldString: string, newString: string): string {
    if (oldString === '') {
      return newString;
    }

    const index = originalContent.indexOf(oldString);
    if (index === -1) {
      this.outputChannel.appendLine(
        `[DiffManager] Warning: old_string not found in file, returning original unchanged`,
      );
      return originalContent;
    }

    return (
      originalContent.substring(0, index) +
      newString +
      originalContent.substring(index + oldString.length)
    );
  }

  private extractMultiEdits(input: Record<string, unknown>): Array<{ old_string: string; new_string: string }> {
    if (!Array.isArray(input.edits)) {
      return [];
    }

    return input.edits
      .map((edit) => {
        if (!edit || typeof edit !== 'object') {
          return null;
        }
        const record = edit as Record<string, unknown>;
        return {
          old_string: typeof record.old_string === 'string' ? record.old_string : '',
          new_string: typeof record.new_string === 'string' ? record.new_string : '',
        };
      })
      .filter((edit): edit is { old_string: string; new_string: string } => edit !== null);
  }

  private applySequentialEdits(
    originalContent: string,
    edits: Array<{ old_string: string; new_string: string }>,
  ): string {
    let result = originalContent;
    for (const edit of edits) {
      result = this.applySingleEdit(result, edit.old_string, edit.new_string);
    }
    return result;
  }

  // ===========================================================================
  // Private: Diff editor management
  // ===========================================================================

  /**
   * Open the VS Code native diff editor for a file.
   */
  private async openDiffEditor(
    filePath: string,
    toolName: string,
  ): Promise<void> {
    const fileName = path.basename(filePath);
    const actionLabel =
      toolName === 'FileWriteTool' ? 'Write' : 'Edit';
    const title = `${fileName} (Proposed ${actionLabel})`;

    const originalUri = vscode.Uri.parse(
      `openclaude-diff-original:${filePath}`,
    );
    const proposedUri = vscode.Uri.parse(
      `openclaude-diff-proposed:${filePath}`,
    );

    // Store the proposed URI so we can identify this tab later
    this.diffEditorTabs.set(filePath, proposedUri);

    // Open the native diff editor
    await vscode.commands.executeCommand(
      'vscode.diff',
      originalUri,
      proposedUri,
      title,
      {
        preview: false, // Don't replace an existing preview tab
        viewColumn: vscode.ViewColumn.Active,
      },
    );
  }

  /**
   * Determine which pending diff is "active" -- the one whose diff editor
   * is currently focused. Falls back to the first pending diff if no
   * diff editor is focused (e.g., command palette invocation).
   */
  private getActivePendingDiff(): PendingDiff | undefined {
    // Strategy 1: Check if the active editor matches a diff URI scheme
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const activeUri = activeEditor.document.uri;
      if (
        activeUri.scheme === 'openclaude-diff-original' ||
        activeUri.scheme === 'openclaude-diff-proposed'
      ) {
        const filePath = activeUri.path;
        const pending = this.pendingDiffs.get(filePath);
        if (pending) {
          return pending;
        }
      }
    }

    // Strategy 2: Check the active tab's input (works for diff editors
    // which may not expose a standard TextEditor)
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (activeTab?.input && typeof activeTab.input === 'object') {
      const tabInput = activeTab.input as {
        original?: vscode.Uri;
        modified?: vscode.Uri;
      };
      if (tabInput.modified?.scheme === 'openclaude-diff-proposed') {
        const filePath = tabInput.modified.path;
        const pending = this.pendingDiffs.get(filePath);
        if (pending) {
          return pending;
        }
      }
      if (tabInput.original?.scheme === 'openclaude-diff-original') {
        const filePath = tabInput.original.path;
        const pending = this.pendingDiffs.get(filePath);
        if (pending) {
          return pending;
        }
      }
    }

    // Strategy 3: Fall back to the first pending diff
    // (handles command palette invocation when no diff tab is focused)
    const firstEntry = this.pendingDiffs.values().next();
    if (!firstEntry.done) {
      return firstEntry.value;
    }

    return undefined;
  }

  /**
   * Close the diff editor tab for a given file path and clean up state.
   * Then process any queued diffs for the same file.
   */
  private async closeDiffAndCleanup(filePath: string): Promise<void> {
    // 1. Close the diff editor tab
    const proposedUri = this.diffEditorTabs.get(filePath);
    if (proposedUri) {
      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          if (this.isOurDiffTab(tab, filePath)) {
            await vscode.window.tabGroups.close(tab);
            break;
          }
        }
      }
    }

    // 2. Remove from content providers
    this.originalProvider.removeContent(filePath);
    this.proposedProvider.removeContent(filePath);

    // 3. Remove from tracking maps
    this.pendingDiffs.delete(filePath);
    this.diffEditorTabs.delete(filePath);

    // 4. Update context variable
    await this.updateContextVariable();

    // 5. Process queued diffs for the same file
    const queued = this.pendingQueue.get(filePath);
    if (queued && queued.length > 0) {
      const next = queued.shift()!;
      if (queued.length === 0) {
        this.pendingQueue.delete(filePath);
      }
      // Process next queued diff (fire-and-forget -- errors handled inside)
      this.showDiff(next.requestId, next.request, next.transport);
    }
  }

  /**
   * Check if a tab is one of our diff editors for a specific file.
   */
  private isOurDiffTab(tab: vscode.Tab, filePath: string): boolean {
    if (!tab.input || typeof tab.input !== 'object') {
      return false;
    }
    const tabInput = tab.input as {
      original?: vscode.Uri;
      modified?: vscode.Uri;
    };
    return (
      (tabInput.modified?.scheme === 'openclaude-diff-proposed' &&
        tabInput.modified.path === filePath) ||
      (tabInput.original?.scheme === 'openclaude-diff-original' &&
        tabInput.original.path === filePath)
    );
  }

  /**
   * Handle tab close events -- if the user manually closes a diff tab,
   * treat it as a rejection so the CLI isn't left hanging.
   */
  private handleTabClose(event: vscode.TabChangeEvent): void {
    for (const closedTab of event.closed) {
      if (!closedTab.input || typeof closedTab.input !== 'object') {
        continue;
      }
      const tabInput = closedTab.input as {
        original?: vscode.Uri;
        modified?: vscode.Uri;
      };
      if (tabInput.modified?.scheme === 'openclaude-diff-proposed') {
        const filePath = tabInput.modified.path;
        const pending = this.pendingDiffs.get(filePath);
        if (pending) {
          this.outputChannel.appendLine(
            `[DiffManager] Diff tab closed for ${filePath}, treating as reject`,
          );
          this.emitStatus('rejected', pending);
          this.sendDenyResponse(
            pending.requestId,
            pending.toolUseId,
            'User closed diff editor without accepting',
            pending.transport,
          );
          // Clean up without trying to close the tab (it's already closed)
          this.originalProvider.removeContent(filePath);
          this.proposedProvider.removeContent(filePath);
          this.pendingDiffs.delete(filePath);
          this.diffEditorTabs.delete(filePath);
          this.updateContextVariable();

          // Process queued diffs for the same file
          const queued = this.pendingQueue.get(filePath);
          if (queued && queued.length > 0) {
            const next = queued.shift()!;
            if (queued.length === 0) {
              this.pendingQueue.delete(filePath);
            }
            this.showDiff(next.requestId, next.request, next.transport);
          }
        }
      }
    }
  }

  // ===========================================================================
  // Private: File operations
  // ===========================================================================

  /**
   * Write content to a file, creating parent directories if needed.
   */
  private async writeFile(
    filePath: string,
    content: string,
  ): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Auto-save the file if it's open in a VS Code editor.
   * This ensures the editor shows the latest content without a "dirty" indicator.
   */
  private async autoSaveFile(filePath: string): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    const openDoc = vscode.workspace.textDocuments.find(
      (doc) => doc.uri.fsPath === uri.fsPath,
    );
    if (openDoc && openDoc.isDirty) {
      await openDoc.save();
    }
  }

  // ===========================================================================
  // Private: Control response helpers
  // ===========================================================================

  /**
   * Send a "success" control_response with behavior: allow.
   * This tells the CLI "the user approved this tool use."
   */
  private sendAllowResponse(
    requestId: string,
    toolUseId: string,
    toolInput: Record<string, unknown>,
    transport: NdjsonTransport,
  ): void {
    transport.write({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: {
          behavior: 'allow',
          updatedInput: toolInput,
          toolUseID: toolUseId,
        },
      },
    });
  }

  /**
   * Send a "success" control_response with behavior: deny.
   *
   * Note: The response subtype is still "success" -- this means "the extension
   * handled the request successfully." The `behavior` field carries the actual
   * permission decision (allow/deny). This matches the PermissionResult type
   * in src/types/session.ts.
   */
  private sendDenyResponse(
    requestId: string,
    toolUseId: string,
    message: string,
    transport: NdjsonTransport,
  ): void {
    transport.write({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: {
          behavior: 'deny',
          message,
          toolUseID: toolUseId,
        },
      },
    });
  }

  // ===========================================================================
  // Private: Context variable management
  // ===========================================================================

  /**
   * Update the openclaude.viewingProposedDiff context variable.
   * When true, the Accept/Reject buttons appear in the editor title bar.
   */
  private async updateContextVariable(): Promise<void> {
    await vscode.commands.executeCommand(
      'setContext',
      'openclaude.viewingProposedDiff',
      this.pendingDiffs.size > 0,
    );
  }

  private emitStatus(stage: DiffStatusEvent['stage'], pending: PendingDiff): void {
    if (!this.statusReporter) {
      return;
    }

    const summary = summarizeLineChanges(
      pending.originalContent,
      pending.proposedContent,
    );
    const preview = buildDiffPreview(
      pending.originalContent,
      pending.proposedContent,
    );

    this.statusReporter({
      stage,
      filePath: pending.filePath,
      fileName: path.basename(pending.filePath),
      toolName: pending.toolName,
      additions: summary.additions,
      deletions: summary.deletions,
      preview,
    });
  }

  // ===========================================================================
  // Dispose
  // ===========================================================================

  dispose(): void {
    // Reject all pending diffs on dispose so CLI isn't left waiting
    for (const [filePath, pending] of this.pendingDiffs.entries()) {
      this.sendDenyResponse(
        pending.requestId,
        pending.toolUseId,
        'Extension deactivated',
        pending.transport,
      );
      this.originalProvider.removeContent(filePath);
      this.proposedProvider.removeContent(filePath);
    }
    // Reject all queued diffs too
    for (const [, queue] of this.pendingQueue.entries()) {
      for (const item of queue) {
        this.sendDenyResponse(
          item.requestId,
          item.request.tool_use_id,
          'Extension deactivated',
          item.transport,
        );
      }
    }
    this.pendingDiffs.clear();
    this.pendingQueue.clear();
    this.diffEditorTabs.clear();
    vscode.commands.executeCommand(
      'setContext',
      'openclaude.viewingProposedDiff',
      false,
    );
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
