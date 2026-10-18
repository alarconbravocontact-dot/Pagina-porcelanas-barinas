import path from 'node:path';
import os from 'node:os';
import { inject } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = inject('databaseUrl');
process.env.STORAGE_DIR = path.join(os.tmpdir(), 'porcelanas-test-storage');
process.env.JOBS_ENABLED = 'false';
process.env.BUSINESS_TIMEZONE = 'America/Caracas';
