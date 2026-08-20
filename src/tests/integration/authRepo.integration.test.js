import {
  describe,
  expect,
  it,
} from 'vitest';

import { createAuthRepository } from '../../repositories/authRepo.js';
import { makeUser } from './fixtures.js';
import { testSql } from './testDb.js';

const authRepository = createAuthRepository(testSql);

describe('findUserCredentials', () => {
  it('returns the user_id and hash for an existing username', async () => {
    const user = await makeUser();

    const credentials =
      await authRepository.findUserCredentials(user.username);

    expect(credentials).toEqual({
      user_id: user.user_id,
      hash: user.hash,
    });
  });
});

describe('insertUser', () => {
  it('stores the user and returns an id that identifies the stored row', async () => {
    const created = await authRepository.insertUser(
      'brand-new-user',
      'fake-argon2-hash',
      'brand-new-user@example.test',
    );

    const [persisted] = await testSql`
      SELECT username, hash, email
      FROM users
      WHERE user_id = ${created.user_id}`;

    expect(persisted).toEqual({
      username: 'brand-new-user',
      hash: 'fake-argon2-hash',
      email: 'brand-new-user@example.test',
    });
  });
});
