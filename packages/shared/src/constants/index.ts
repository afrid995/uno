export const USERNAME_RULES = {
  MIN_LENGTH: 2,
  MAX_LENGTH: 20,
  // Allowed characters: letters (any Unicode language), numbers, spaces, underscores, dashes, periods
  // Strictly blocks non-printable control characters, newlines, tabs, etc.
  PATTERN: /^[\p{L}\p{N}_\-. ]+$/u,
} as const;

export const SESSION_CONFIG = {
  DEFAULT_EXPIRATION_HOURS: 24,
  COOKIE_NAME: 'uno_session',
  TOKEN_BYTES: 32, // 256 bits of cryptographic entropy
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_INVALID: 'SESSION_INVALID',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_IMPERSONATION: 'SESSION_IMPERSONATION',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const;
