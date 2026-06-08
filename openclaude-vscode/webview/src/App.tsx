import { useState, useEffect } from 'react';
import { ChatPanel } from './components/chat/ChatPanel';
import { PermissionDialog } from './components/dialogs/PermissionDialog';
import { TeleportDialog } from './components/dialogs/TeleportDialog';
import { ElicitationDialog } from './components/dialogs/ElicitationDialog';
import { usePermissions } from './hooks/usePermissions';
import { vscode } from './vscode';
import type {
  TeleportState,
  ElicitationField,
  ElicitationState,
} from './types/interactions';

function isElicitationFieldType(value: unknown): value is ElicitationField['type'] {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  switch (candidate.type) {
    case 'text':
      return candidate.placeholder === undefined || typeof candidate.placeholder === 'string';
    case 'confirm':
      return candidate.default === undefined || typeof candidate.default === 'boolean';
    case 'select':
    case 'multiselect':
      return Array.isArray(candidate.options) && candidate.options.every((option) => {
        if (!option || typeof option !== 'object') {
          return false;
        }
        const item = option as Record<string, unknown>;
        return (
          typeof item.value === 'string' &&
          typeof item.label === 'string' &&
          (item.description === undefined || typeof item.description === 'string') &&
          (item.recommended === undefined || typeof item.recommended === 'boolean') &&
          (item.recommendationNote === undefined || typeof item.recommendationNote === 'string')
        );
      });
    default:
      return false;
  }
}

function isElicitationField(value: unknown): value is ElicitationField {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.required === 'boolean' &&
    isElicitationFieldType(candidate.type)
  );
}

function getElicitationFields(value: unknown): ElicitationField[] {
  return Array.isArray(value) ? value.filter(isElicitationField) : [];
}

function App() {
  const { currentRequest, queue, pendingCount, respond } = usePermissions();
  const [teleportState, setTeleportState] = useState<TeleportState>({
    isVisible: false,
    info: null,
  });
  const [elicitationState, setElicitationState] = useState<ElicitationState>({
    isVisible: false,
    request: null,
  });

  // Listen for teleport and elicitation messages from the extension host
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'show_teleport') {
        setTeleportState({
          isVisible: true,
          info: {
            remoteSessionId: data.remoteSessionId as string,
            branch: data.branch as string,
            messageCount: data.messageCount as number,
            sourceDevice: data.sourceDevice as string,
            timestamp: data.timestamp as string,
          },
        });
        return;
      }

      if (data.type === 'show_elicitation') {
        setElicitationState({
          isVisible: true,
          request: {
            requestId: data.requestId as string,
            message: data.message as string,
            title: data.title as string | undefined,
            helperText: data.helperText as string | undefined,
            submitLabel: data.submitLabel as string | undefined,
            cancelLabel: data.cancelLabel as string | undefined,
            fields: getElicitationFields(data.fields),
          },
        });
        return;
      }

      if (data.type === 'dismiss_elicitation') {
        setElicitationState({ isVisible: false, request: null });
        return;
      }

      const msg = data.type === 'cli_output' ? data.data : data;
      if (!msg || typeof msg !== 'object') return;
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <>
      <ChatPanel
        permissionRequest={currentRequest}
        permissionQueue={queue}
        pendingPermissionCount={pendingCount}
        onPermissionAllow={(id, updatedInput) => respond(id, true, false, updatedInput)}
        onPermissionAlwaysAllow={(id) => respond(id, true, true)}
        onPermissionDeny={(id) => respond(id, false)}
      />

      {/* Permission dialog overlay */}
      {currentRequest && (
        <PermissionDialog
          request={currentRequest}
          pendingCount={pendingCount}
          onAllow={(id, updatedInput) => respond(id, true, false, updatedInput)}
          onAlwaysAllow={(id) => respond(id, true, true)}
          onDeny={(id) => respond(id, false)}
        />
      )}

      {/* Teleport dialog overlay */}
      {teleportState.isVisible && teleportState.info && (
        <TeleportDialog
          info={teleportState.info}
          onAccept={() => {
            vscode.postMessage({
              type: 'teleport_accept',
              remoteSessionId: teleportState.info!.remoteSessionId,
            });
            setTeleportState({ isVisible: false, info: null });
          }}
          onReject={() => {
            vscode.postMessage({
              type: 'teleport_reject',
              remoteSessionId: teleportState.info!.remoteSessionId,
            });
            setTeleportState({ isVisible: false, info: null });
          }}
        />
      )}

      {/* Elicitation dialog overlay */}
      {elicitationState.isVisible && elicitationState.request && (
        <ElicitationDialog
          request={elicitationState.request}
          onSubmit={(values) => {
            vscode.postMessage({
              type: 'elicitation_response',
              requestId: elicitationState.request!.requestId,
              values,
            });
            setElicitationState({ isVisible: false, request: null });
          }}
          onCancel={() => {
            vscode.postMessage({
              type: 'elicitation_cancel',
              requestId: elicitationState.request!.requestId,
            });
            setElicitationState({ isVisible: false, request: null });
          }}
        />
      )}
    </>
  );
}

export default App;
