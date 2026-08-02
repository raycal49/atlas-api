import { createDb } from '../../database/db.js';

const assertSafeTestDatabase = () => {
  const rawUrl = process.env.DATABASE_URL;

  if (!rawUrl) {
    throw new Error(
      'Integration tests require DATABASE_URL.',
    );
  }

  let url;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(
      'Integration test DATABASE_URL is not a valid URL.',
    );
  }

  const isSafe =
    process.env.NODE_ENV === 'test'
    && url.hostname === '127.0.0.1'
    && url.port === '55432'
    && url.pathname === '/geoapp_test'
    && url.username === 'postgres';

  if (!isSafe) {
    throw new Error(
      [
        'Refusing to run integration tests against an unexpected database.',
        `Received: ${url.hostname}:${url.port}${url.pathname}`,
        'Expected: 127.0.0.1:55432/geoapp_test',
      ].join('\n'),
    );
  }
};

assertSafeTestDatabase();

export const testSql = createDb();

export const resetTestDatabase = async () => {
  await testSql`
    TRUNCATE TABLE
      public.payment_history,
      public.subscriptions,
      public.api_usage,
      public.users
    RESTART IDENTITY
    CASCADE
  `;
};