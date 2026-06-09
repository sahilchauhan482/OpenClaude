export function isAssistantMode(): boolean {
  return false;
}

let assistantForced = false;

export function markAssistantForced(): void {
  assistantForced = true;
}

export function isAssistantForced(): boolean {
  return assistantForced;
}

export async function initializeAssistantTeam(): Promise<undefined> {
  return undefined;
}

export function getAssistantSystemPromptAddendum(): string {
  return '';
}

export function getAssistantActivationPath(): string | undefined {
  return undefined;
}
