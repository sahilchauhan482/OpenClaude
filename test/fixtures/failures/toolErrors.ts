import {
  createUnauthorizedError,
  createTimeoutError,
  createPermissionDeniedError,
} from './apiErrors.js'

export const toolFailureMessages = {
  fileWrite: 'Error writing file: failed to replace text',
  fileWriteAccessDenied: 'Error writing file: EACCES',
  fileWritePermissionDenied: 'Error writing file: EPERM',
  fileWriteNotFound: 'Error writing file: ENOENT not found',
  fileNotFound: 'ENOENT: no such file or directory',
  noSuchTool: (tool: string) => `No such tool available: ${tool}`,
  invalidParams: 'Invalid tool parameters: malformed input',
  invalidParamsPythonHeredoc: 'Invalid tool parameters: malformed Python heredoc',
  invalidParamsMissingPath: 'Invalid tool parameters: missing path',
  inputValidation: 'InputValidationError: old_string not found',
  editMismatch: 'Error editing file: String not found in file',
  permissionDenied: createPermissionDeniedError().message,
  unauthorized: createUnauthorizedError().message,
  timeout: createTimeoutError().message,
  moduleNotFound: (module: string) => `Error: Cannot find module '${module}'`,
  fileWriteFailed: 'Error writing file: failed',
}
