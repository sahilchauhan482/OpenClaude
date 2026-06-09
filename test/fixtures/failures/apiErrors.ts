export interface ApiError {
  code: string;
  message: string;
  status: number;
}

export interface UnauthorizedError extends ApiError {
  code: 'UNAUTHORIZED';
}

export interface TimeoutError extends ApiError {
  code: 'TIMEOUT';
}

export interface PermissionDeniedError extends ApiError {
  code: 'PERMISSION_DENIED';
}

export const createUnauthorizedError = (message = 'Unauthorized'): UnauthorizedError => ({
  code: 'UNAUTHORIZED',
  message,
  status: 401,
});

export const createTimeoutError = (message = 'Request timed out'): TimeoutError => ({
  code: 'TIMEOUT',
  message,
  status: 408,
});

export const createPermissionDeniedError = (message = 'Permission denied'): PermissionDeniedError => ({
  code: 'PERMISSION_DENIED',
  message,
  status: 403,
});
