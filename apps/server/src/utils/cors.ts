import { env } from '../config/env';

/**
 * Parses and returns the list of permitted origins, expanding comma-separated
 * origin strings and including standard local development hosts.
 */
export function getAllowedOrigins(): string[] {
  const configured = env.CORS_ORIGIN
    ? env.CORS_ORIGIN.split(',')
        .map((s) => s.trim().replace(/\/+$/, ''))
        .filter(Boolean)
    : [];

  const defaults = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ];

  return Array.from(new Set([...configured, ...defaults]));
}

/**
 * Validates whether an incoming HTTP or WebSocket origin is permitted.
 * Supports exact origin matches, wildcard '*' patterns (e.g. 'https://*.vercel.app'),
 * and non-browser origins (undefined).
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  // Allow non-browser agents (curl, server-to-server health checks, testing tools)
  if (!origin) {
    return true;
  }

  const normalized = origin.trim().replace(/\/+$/, '');
  const allowed = getAllowedOrigins();

  // If wildcard '*' is explicitly set, permit all origins
  if (allowed.includes('*')) {
    return true;
  }

  // Exact match
  if (allowed.includes(normalized)) {
    return true;
  }

  // Wildcard pattern matching (e.g. 'https://*.vercel.app' or 'https://uno-*-myteam.vercel.app')
  for (const pattern of allowed) {
    if (pattern.includes('*')) {
      const regexPattern =
        '^' +
        pattern
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*') +
        '$';
      if (new RegExp(regexPattern, 'i').test(normalized)) {
        return true;
      }
    }
  }

  return false;
}
