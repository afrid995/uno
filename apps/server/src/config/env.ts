import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env from workspace root or server directory
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config(); // fallback to local directory

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z
    .string()
    .default('4000')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0 && val < 65536, {
      message: 'PORT must be a valid port number (1-65535)',
    }),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters long'),
  SESSION_EXPIRATION_HOURS: z
    .string()
    .default('24')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0, {
      message: 'SESSION_EXPIRATION_HOURS must be a positive integer',
    }),
  COOKIE_SECRET: z.string().default('dev_cookie_secret_fallback_do_not_use_in_prod'),
  COOKIE_NAME: z.string().default('uno_session'),
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .default('60000')
    .transform((val) => parseInt(val, 10)),
  RATE_LIMIT_MAX_GUEST: z
    .string()
    .default('60')
    .transform((val) => parseInt(val, 10)),
  RECONNECT_GRACE_PERIOD_MS: z
    .string()
    .default('120000')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0, {
      message: 'RECONNECT_GRACE_PERIOD_MS must be a positive integer',
    }),
  ENABLE_TEST_HELPERS: z
    .string()
    .optional()
    .transform((val) => val === 'true')
    .default('false'),
  TEST_HELPER_SECRET: z
    .string()
    .min(16, 'TEST_HELPER_SECRET must be at least 16 characters long')
    .optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ FATAL: Environment variable validation failed:');
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
