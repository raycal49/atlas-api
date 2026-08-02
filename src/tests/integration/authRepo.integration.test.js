import {
  describe,
  expect,
  it,
} from 'vitest';

import { createAuthRepository } from '../../repositories/authRepo.js';
import { testSql } from './testDb.js';

describe('auth repository integration', () => {
  const authRepository = createAuthRepository(testSql);

  it('inserts a user and reads it back from PostgreSQL', async () => {
    const username = 'integration-test-user';
    const hash = 'fake-hash-for-database-testing';
    const email = 'integration-test@example.com';

    const createdUser = await authRepository.insertUser(
      username,
      hash,
      email,
    );

    expect(createdUser.user_id).toBeDefined();

    const retrievedUser =
      await authRepository.findUserCredentials(username);

    expect(retrievedUser).toEqual({
      user_id: createdUser.user_id,
      hash,
    });
  });
});