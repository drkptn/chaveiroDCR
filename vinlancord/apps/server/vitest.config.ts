import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    globalSetup: ['test/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      VINLANCORD_SKIP_DOTENV: '1',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://vinlancord:vinlancord_dev@localhost:5432/vinlancord_test',
      REDIS_URL: '',
      PUBLIC_URL: 'http://127.0.0.1:0',
      SECRET_KEY: 'test-secret-key-test-secret-key-test-secret-key',
      STORAGE_LOCAL_DIR: './data/test-uploads',
      MEDIASOUP_WORKERS: '1',
      MEDIASOUP_PORT: '41000',
      MEDIASOUP_ANNOUNCED_IP: '127.0.0.1',
      MEDIASOUP_LISTEN_IP: '127.0.0.1',
      LOG_LEVEL: 'error',
      ADMIN_TOKEN: 'test-admin-token-test-admin-token-123',
    },
  },
});
