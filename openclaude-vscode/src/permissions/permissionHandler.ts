// src/permissions/permissionHandler.ts
// Central coordinator for the permission system on the extension host side.
//
// Receives `can_use_tool` control_requests from the CLI (via ControlRouter),
// checks current mode + always-allow rules for auto-approve, and if not
// auto-approved, forwards to webview as permission_request. Handles webview
// responses (allow/deny/always-allow) and sends control_response back to CLI.

import * as vscode from 'vscode';
import type { WebviewManager } from '../webview/webviewManager';
import type { PermissionRules } from './permissionRules';
import type { ControlRequestPermission, ControlRequestSetPermissionMode } from '../types/messages';
import type { PermissionMode, PermissionResult } from '../types/session';

/** File edit tool names that are handled by DiffManager, not PermissionHandler */
const FILE_EDIT_TOOLS = new Set([
  'Write',
  'Edit',
  'MultiEdit',
  'FileEditTool',
  'FileWriteTool',
  'NotebookEditTool',
]);

/** Tools that are auto-allowed in acceptEdits mode */
const ACCEPT_EDITS_TOOLS = new Set([
  ...FILE_EDIT_TOOLS,
]);

/** Interactive tools must still prompt even in full access because they collect user decisions. */
const ALWAYS_INTERACTIVE_TOOLS = new Set([
  'AskUserQuestion',
  'ExitPlanMode',
]);

/** Callback to write a control_response to the CLI's stdin */
export type WriteToStdinFn = (message: unknown) => void;

interface PendingRequest {
  requestId: string;
  request: ControlRequestPermission;
  signal: AbortSignal;
}

export class PermissionHandler implements vscode.Disposable {
  private currentMode: PermissionMode = 'default';
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly disposables: vscode.Disposable[] = [];
  private writeToStdin: WriteToStdinFn | undefined;

  constructor(
    private readonly webviewManager: WebviewManager,
    private readonly rules: PermissionRules,
    private readonly output: vscode.OutputChannel,
  ) {
    // Listen for permission_response from webview
    this.disposables.push(
      webviewManager.onMessage('permission_response', (message) => {
        this.handlePermissionResponse(
          message.requestId,
          message.allowed,
          message.alwaysAllow ?? false,
          message.updatedInput as Record<string, unknown> | undefined,
        );
      }),
    );
  }

  /**
   * Set the callback used to write control_response messages to the CLI.
   * Must be called before handling any requests.
   */
  setWriteToStdin(fn: WriteToStdinFn): void {
    this.writeToStdin = fn;
  }

  /**
   * Get the current permission mode.
   */
  getMode(): PermissionMode {
    return this.currentMode;
  }

  /**
   * Set the permission mode. Called from CLI (set_permission_mode) or webview.
   */
  setMode(mode: PermissionMode): boolean {
    const previousMode = this.currentMode;

    // Bypass mode is gated behind the allowDangerouslySkipPermissions setting
    if (mode === 'bypassPermissions' || mode === 'fullAccess') {
      const config = vscode.workspace.getConfiguration('openclaudeCode');
      const allowed = config.get<boolean>('allowDangerouslySkipPermissions', false);
      if (!allowed) {
        this.output.appendLine(
          '[PermissionHandler] Bypass mode blocked — allowDangerouslySkipPermissions is false',
        );
        vscode.window.showWarningMessage(
          'OpenClaude: Bypass permissions mode is disabled. Enable "openclaudeCode.allowDangerouslySkipPermissions" in settings first.',
        );
        this.webviewManager.broadcast({
          type: 'permission_mode_rejected',
          requestedMode: mode,
          currentMode: previousMode,
          reason: 'Bypass permissions mode is disabled in settings.',
        });
        return false;
      }
    }

    this.output.appendLine(`[PermissionHandler] Mode changed: ${this.currentMode} → ${mode}`);
    this.currentMode = mode;
    const config = vscode.workspace.getConfiguration('openclaudeCode');
    this.webviewManager.broadcast({
      type: 'permission_mode_changed',
      mode: this.currentMode,
      bypassEnabled: config.get<boolean>('allowDangerouslySkipPermissions', false),
    });
    return true;
  }

  /**
   * Handle a can_use_tool control_request for a non-file-edit tool.
   * Returns a PermissionResult if auto-approved, or undefined if forwarded to webview.
   */
  async handleToolRequest(
    request: ControlRequestPermission,
    signal: AbortSignal,
    requestId: string,
  ): Promise<PermissionResult | symbol> {
    const { tool_name } = request;

    // Check auto-approve conditions
    const autoResult = this.checkAutoApprove(request);
    if (autoResult) {
      this.output.appendLine(
        `[PermissionHandler] Auto-approved: ${tool_name} (mode=${this.currentMode})`,
      );
      return autoResult;
    }

    // Not auto-approved — forward to webview as permission_request
    this.output.appendLine(
      `[PermissionHandler] Requesting permission for: ${tool_name}`,
    );

    this.pendingRequests.set(requestId, { requestId, request, signal });

    // Listen for abort (control_cancel_request)
    signal.addEventListener('abort', () => {
      this.pendingRequests.delete(requestId);
      this.webviewManager.broadcast({
        type: 'cancel_request',
        requestId,
      });
    });

    // Send permission_request to webview
    this.webviewManager.broadcast({
      type: 'permission_request',
      requestId,
      toolName: request.tool_name,
      toolInput: request.input,
      riskLevel: this.classifyRisk(request.tool_name),
      title: request.title,
      description: request.description,
      decisionReason: request.decision_reason,
      blockedPath: request.blocked_path,
      permissionSuggestions: request.permission_suggestions,
      agentId: request.agent_id,
    });

    // Response is handled asynchronously via handlePermissionResponse
    // Return a sentinel so ControlRouter knows not to send an automatic response
    const { SELF_HANDLED } = await import('../process/controlRouter');
    return SELF_HANDLED;
  }

  /**
   * Handle a set_permission_mode control_request from the CLI.
   */
  handleSetPermissionMode(request: ControlRequestSetPermissionMode): Record<string, unknown> {
    const applied = this.setMode(request.mode);
    if (!applied) {
      throw new Error(`Permission mode change rejected: ${request.mode}`);
    }
    return { mode: request.mode };
  }

  /**
   * Handle a control_cancel_request — dismiss the permission dialog.
   */
  handleCancel(requestId: string): void {
    this.pendingRequests.delete(requestId);
    this.webviewManager.broadcast({
      type: 'cancel_request',
      requestId,
    });
  }

  private checkAutoApprove(request: ControlRequestPermission): PermissionResult | null {
    const { tool_name } = request;

    if (ALWAYS_INTERACTIVE_TOOLS.has(tool_name)) {
      return null;
    }

    // bypassPermissions mode: auto-allow everything
    if (this.currentMode === 'bypassPermissions' || this.currentMode === 'fullAccess') {
      return {
        behavior: 'allow',
        updatedInput: request.input,
        toolUseID: request.tool_use_id,
      };
    }

    // acceptEdits mode: auto-allow file edit tools
    if (this.currentMode === 'acceptEdits' && ACCEPT_EDITS_TOOLS.has(tool_name)) {
      return {
        behavior: 'allow',
        updatedInput: request.input,
        toolUseID: request.tool_use_id,
      };
    }

    // Session "always allow" rules
    if (this.rules.has(tool_name)) {
      return {
        behavior: 'allow',
        updatedInput: request.input,
        toolUseID: request.tool_use_id,
        decisionClassification: 'user_permanent',
      };
    }

    return null;
  }

  private handlePermissionResponse(
    requestId: string,
    allowed: boolean,
    alwaysAllow: boolean,
    updatedInput?: Record<string, unknown>,
  ): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      this.output.appendLine(
        `[PermissionHandler] No pending request for ID: ${requestId}`,
      );
      return;
    }

    this.pendingRequests.delete(requestId);

    if (alwaysAllow && allowed) {
      this.rules.add(pending.request.tool_name);
      this.output.appendLine(
        `[PermissionHandler] Added always-allow rule for: ${pending.request.tool_name}`,
      );
    }

    let result: PermissionResult;
    if (allowed) {
      result = {
        behavior: 'allow',
        updatedInput: updatedInput ?? pending.request.input,
        toolUseID: pending.request.tool_use_id,
        decisionClassification: alwaysAllow ? 'user_permanent' : 'user_temporary',
      };
    } else {
      result = {
        behavior: 'deny',
        message: 'User denied permission',
        toolUseID: pending.request.tool_use_id,
        decisionClassification: 'user_reject',
      };
    }

    // Send control_response back to CLI
    this.sendControlResponse(requestId, result);
  }

  private sendControlResponse(requestId: string, result: PermissionResult): void {
    if (!this.writeToStdin) {
      this.output.appendLine(
        '[PermissionHandler] No writeToStdin callback set, cannot send response',
      );
      return;
    }

    this.writeToStdin({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: result,
      },
    });
  }

  private classifyRisk(toolName: string): string {
    const dangerousTools = ['Bash', 'bash', 'execute', 'Execute', 'BashTool'];
    const editTools = ['Write', 'Edit', 'MultiEdit', 'FileEditTool', 'FileWriteTool', 'NotebookEditTool'];

    if (dangerousTools.some((t) => toolName.includes(t))) return 'high';
    if (editTools.some((t) => toolName.includes(t))) return 'medium';
    return 'low';
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    this.pendingRequests.clear();
  }
}
