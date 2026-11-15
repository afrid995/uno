import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAllowedOrigins, isOriginAllowed } from '../../src/utils/cors';
import { env } from '../../src/config/env';

describe('CORS & Allowed Origins Utility Tests', () => {
  const originalCors = env.CORS_ORIGIN;

  afterEach(() => {
    (env as any).CORS_ORIGIN = originalCors;
  });

  it('includes configured origin and localhost defaults', () => {
    (env as any).CORS_ORIGIN = 'https://uno-ultimate.vercel.app';
    const origins = getAllowedOrigins();

    expect(origins).toContain('https://uno-ultimate.vercel.app');
    expect(origins).toContain('http://localhost:5173');
    expect(origins).toContain('http://127.0.0.1:5173');
  });

  it('parses comma-separated multiple origins and strips trailing slashes', () => {
    (env as any).CORS_ORIGIN = 'https://uno.vercel.app/, https://preview.vercel.app';
    const origins = getAllowedOrigins();

    expect(origins).toContain('https://uno.vercel.app');
    expect(origins).toContain('https://preview.vercel.app');
  });

  it('allows non-browser origins (undefined)', () => {
    expect(isOriginAllowed(undefined)).toBe(true);
  });

  it('allows exact origin matches', () => {
    (env as any).CORS_ORIGIN = 'https://uno-ultimate.vercel.app';
    expect(isOriginAllowed('https://uno-ultimate.vercel.app')).toBe(true);
    expect(isOriginAllowed('https://uno-ultimate.vercel.app/')).toBe(true);
    expect(isOriginAllowed('http://localhost:5173')).toBe(true);
  });

  it('rejects unpermitted third-party origins', () => {
    (env as any).CORS_ORIGIN = 'https://uno-ultimate.vercel.app';
    expect(isOriginAllowed('https://malicious-site.com')).toBe(false);
    expect(isOriginAllowed('http://localhost:3000')).toBe(false);
  });

  it('supports wildcard patterns such as *.vercel.app', () => {
    (env as any).CORS_ORIGIN = 'https://*.vercel.app';
    expect(isOriginAllowed('https://uno-prod.vercel.app')).toBe(true);
    expect(isOriginAllowed('https://uno-preview-123.vercel.app')).toBe(true);
    expect(isOriginAllowed('https://other-domain.com')).toBe(false);
  });
});
