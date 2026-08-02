// import { defineConfig } from 'vitest/config';

// export default defineConfig({
//   test: {
//     environment: 'node',

//     include: [
//       'src/tests/**/*.test.js',
//     ],

//     exclude: [
//       'src/tests/integration/**',
//     ],
//   },
// });

import {
  configDefaults,
  defineConfig,
} from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',

    include: [
      'src/tests/**/*.test.js',
    ],

    exclude: [
      ...configDefaults.exclude,
      'src/tests/integration/**',
    ],
  },
});