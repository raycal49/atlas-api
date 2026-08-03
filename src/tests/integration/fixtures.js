import { testSql } from './testDb.js';

// Fixtures insert rows directly, never through a repository. If setup went
// through the code under test, one bug there would corrupt the arrange step of
// every other test and produce a wall of unrelated failures.

// users.username, users.email, plans.plan_name and api_products.api_name are
// all UNIQUE, so a hardcoded default would trip 23505 on the second call within
// a single test -- which reads like a bug in the code under test rather than in
// the fixture. Every generated value carries this counter.
//
// vitest runs with isolate: true, so each test file gets its own module
// instance and the counter restarts per file. That is harmless: beforeEach
// truncates, so there is nothing left to collide with.
let sequence = 0;

const next = () => (sequence += 1);

// username is citext -- 'Alice' and 'alice' are the same value as far as
// users_username_key is concerned, so uniqueness here has to survive case
// folding. A numeric suffix does.
export const makeUser = async (overrides = {}) => {
  const n = next();

  const row = {
    username: `user-${n}`,
    hash: `fake-argon2-hash-${n}`,
    email: `user-${n}@example.test`,
    ...overrides,
  };

  const [user] = await testSql`
    INSERT INTO users ${testSql(row)}
    RETURNING *`;

  return user;
};
