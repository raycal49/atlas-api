import { afterAll, beforeAll, beforeEach } from 'vitest';

import { resetTestDatabase, testSql } from './testDb.js';

beforeAll(async () => {
  await testSql`SELECT 1`;
});

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await resetTestDatabase();
  await testSql.end();
});
