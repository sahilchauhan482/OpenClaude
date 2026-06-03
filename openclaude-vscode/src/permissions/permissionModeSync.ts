import type { PermissionMode } from '../types/session';

/**
 * Decide whether a permission mode change should be forwarded to the CLI.
 *
 * The host UI mode is not a reliable proxy for the CLI's current mode after
 * reloads/resumes, so we only gate on whether a process is available.
 */
export function shouldForwardPermissionModeToCli(
  processManagerAvailable: boolean,
  _requestedMode: PermissionMode,
  _currentHostMode: PermissionMode,
): boolean {
  return processManagerAvailable;
}
