import {
  configDefaults,
  defineConfig,
} from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',

    include: [
      'src/tests/unit/**/*.test.js',
    ],

    exclude: [
      ...configDefaults.exclude,
      'src/tests/integration/**',
    ],
  },
});