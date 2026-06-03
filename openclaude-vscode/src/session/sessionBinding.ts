export function resolveOutgoingSessionId(
  activeSessionId?: string,
  processSessionId?: string,
): string | undefined {
  const active = activeSessionId?.trim();
  if (active) {
    return active;
  }

  const process = processSessionId?.trim();
  if (process) {
    return process;
  }

  return undefined;
}

export function resolveSessionIdForSpawn(
  activeSessionId?: string,
  requestedSessionId?: string,
): string | undefined {
  const active = activeSessionId?.trim();
  if (active) {
    return active;
  }

  const requested = requestedSessionId?.trim();
  if (requested) {
    return requested;
  }

  return undefined;
}

export interface OutgoingUserMessageEnvelope {
  type: 'user';
  session_id?: string;
  message: {
    role: 'user';
    content: unknown;
  };
}

export function buildOutgoingUserMessage(
  content: unknown,
  sessionId?: string,
): OutgoingUserMessageEnvelope {
  const outgoingSessionId = sessionId?.trim();
  return {
    type: 'user',
    ...(outgoingSessionId ? { session_id: outgoingSessionId } : {}),
    message: {
      role: 'user',
      content,
    },
  };
}
