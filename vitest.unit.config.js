import {
  configDefaults,
  defineConfig,
} from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',

    // authServices.js imports config/jwt.js, which throws at load when
    // JWT_SECRET is unset. The unit tests mock jose outright, so the value is
    // never used -- it only has to exist for the import to succeed. The
    // integration suite gets the same variable from .env.integration instead.
    // env: {
    //   JWT_SECRET: 'unit-test-secret-not-a-real-key',
    // },

    include: [
      'src/tests/**/*.test.js',
    ],

    exclude: [
      ...configDefaults.exclude,
      'src/tests/integration/**',
    ],
  },
});