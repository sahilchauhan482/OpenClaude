// webview/src/hooks/usePermissions.ts
// React hook managing the queue of pending permission requests.
// Listens for permission_request and cancel_request messages from the extension host.

import { useState, useCallback, useEffect } from 'react';
import { vscode } from '../vscode';
import type { ElicitationField } from '../types/interactions';

export interface PermissionRequest {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  riskLevel?: string;
  title?: string;
  description?: string;
  decisionReason?: string;
  blockedPath?: string;
  permissionSuggestions?: unknown[];
  agentId?: string;
  interaction?: {
    kind: 'structured_questions';
    title?: string;
    helperText?: string;
    submitLabel?: string;
    cancelLabel?: string;
    fields: ElicitationField[];
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeQuestionOptions(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.label !== 'string' || !entry.label.trim()) {
      return [];
    }

    return [{
      value: entry.label,
      label: entry.label,
      description: typeof entry.description === 'string' ? entry.description : undefined,
      recommended: /\(recommended\)/i.test(entry.label),
    }];
  });
}

function normalizeStructuredQuestions(
  toolName: string,
  toolInput: Record<string, unknown>,
): PermissionRequest['interaction'] | undefined {
  const normalizedToolName = toolName.trim().toLowerCase();
  const rawQuestions = toolInput.questions;

  if (
    !normalizedToolName.includes('askuserquestion') &&
    !normalizedToolName.includes('requestuserinput') &&
    !normalizedToolName.includes('request_user_input') &&
    !Array.isArray(rawQuestions)
  ) {
    return undefined;
  }

  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    return undefined;
  }

  const fields: ElicitationField[] = rawQuestions.flatMap((question, index) => {
    if (!isRecord(question)) {
      return [];
    }

    const options = normalizeQuestionOptions(question.options);
    if (options.length === 0) {
      return [];
    }

    const header = typeof question.header === 'string' ? question.header.trim() : '';
    const prompt = typeof question.question === 'string' ? question.question.trim() : '';
    const fallbackLabel = header || `Question ${index + 1}`;
    const answerKey = prompt || header || `Question ${index + 1}`;

    return [{
      name: answerKey,
      label: fallbackLabel,
      required: true,
      helperText: prompt || undefined,
      type:
        question.multiSelect
          ? { type: 'multiselect', options }
          : { type: 'select', options },
    }];
  });

  if (fields.length === 0) {
    return undefined;
  }

  const firstQuestion = rawQuestions.find(isRecord);
  return {
    kind: 'structured_questions',
    title: normalizedToolName.includes('askuserquestion') ? 'Question from AI' : 'Choose an option',
    helperText:
      rawQuestions.length === 1 && firstQuestion && typeof firstQuestion.question === 'string'
        ? firstQuestion.question
        : undefined,
    submitLabel: 'Submit Choice',
    cancelLabel: 'Cancel',
    fields,
  };
}

export function usePermissions() {
  const [queue, setQueue] = useState<PermissionRequest[]>([]);

  useEffect(() => {
    // Listen for permission_request messages
    const unsubPermission = vscode.onMessage('permission_request', (message) => {
      const req: PermissionRequest = {
        requestId: message.requestId as string,
        toolName: message.toolName as string,
        toolInput: (message.toolInput as Record<string, unknown>) ?? {},
        riskLevel: message.riskLevel as string | undefined,
        title: message.title as string | undefined,
        description: message.description as string | undefined,
        decisionReason: message.decisionReason as string | undefined,
        blockedPath: message.blockedPath as string | undefined,
        permissionSuggestions: message.permissionSuggestions as unknown[] | undefined,
        agentId: message.agentId as string | undefined,
        interaction: normalizeStructuredQuestions(
          message.toolName as string,
          ((message.toolInput as Record<string, unknown>) ?? {}),
        ),
      };
      setQueue((prev) => [...prev, req]);
    });

    // Listen for cancel_request messages
    const unsubCancel = vscode.onMessage('cancel_request', (message) => {
      const cancelId = message.requestId as string;
      setQueue((prev) => prev.filter((r) => r.requestId !== cancelId));
    });

    return () => {
      unsubPermission();
      unsubCancel();
    };
  }, []);

  // Current request is the first in the FIFO queue
  const currentRequest = queue.length > 0 ? queue[0] : null;
  const pendingCount = queue.length;

  // Respond to the current request and remove it from the queue
  const respond = useCallback(
    (
      requestId: string,
      allowed: boolean,
      alwaysAllow?: boolean,
      updatedInput?: Record<string, unknown>,
    ) => {
      vscode.postMessage({
        type: 'permission_response',
        requestId,
        allowed,
        alwaysAllow: alwaysAllow ?? false,
        ...(updatedInput ? { updatedInput } : {}),
      });
      setQueue((prev) => prev.filter((r) => r.requestId !== requestId));
    },
    [],
  );

  // Dismiss the current request (deny it)
  const dismissRequest = useCallback(
    (requestId: string) => {
      respond(requestId, false);
    },
    [respond],
  );

  return {
    currentRequest,
    queue,
    pendingCount,
    respond,
    dismissRequest,
  };
}
