import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    env: {
      DB_NAME: process.env.TEST_DB_NAME ?? 'colomba_test',
      INVITE_ONLY: 'false',
      RATE_LIMIT: 'false',
      WEATHER_ENABLED: 'false',
      SCHEDULER_ENABLED: 'false',
      DEV_LOG_CODES: 'false',
      ORS_API_KEY: '',
      GRAPHHOPPER_API_KEY: '',
      MEDIA_DIR: '/tmp/colomba-test-media',
      ADMIN_EMAILS: 'admin@example.com',
    },
  },
});
