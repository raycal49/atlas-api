import { createApp } from '../../app.js';
import { createContainer } from '../../container.js';
import { testSql } from './testDb.js';

export const testJwtSecret =
  new TextEncoder().encode('integration-test-secret');

export const createTestApp = () =>
  createApp(createContainer({ sql: testSql, jwtSecret: testJwtSecret }));
