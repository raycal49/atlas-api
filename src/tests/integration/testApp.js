import { createApp } from '../../app.js';
import { createContainer } from '../../container.js';
import { testSql } from './testDb.js';

// The real container over the test pool: real routes, real middleware, real
// repositories, real Postgres. Only the connection string differs from prod.
//
// Never call container.close() from a test -- it calls sql.end()
// (container.js:41), and setup.js already ends testSql in its afterAll.
// Ending the pool twice breaks teardown for every file after this one.
export const createTestApp = () => createApp(createContainer({ sql: testSql }));
