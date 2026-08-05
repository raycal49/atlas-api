import { createApp } from '../../app.js';
import { createContainer } from '../../container.js';
import { createJwtSecret } from '../../config/jwt.js';
import { testSql } from './testDb.js';

export const testJwtSecret = createJwtSecret();

export const createTestApp = () =>
  createApp(createContainer({ sql: testSql, jwtSecret: testJwtSecret }));
