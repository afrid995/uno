import dotenv from 'dotenv';
import path from 'path';

// Load .env explicitly for all vitest suites
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
