import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',

    include: [
      'src/tests/integration/**/*.integration.test.js',
    ],

    setupFiles: [
      './src/tests/integration/setup.js',
    ],

    isolate: true,
    fileParallelism: false,

    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});