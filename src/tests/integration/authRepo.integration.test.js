import {
  describe,
  expect,
  it,
} from 'vitest';

import { ExistingAccountError } from '../../errors/authErrors.js';
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

    // looking the row up by the returned id is what makes this an assertion
    // about behaviour: if the id were wrong or invented, there would be no row
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

  it('rejects a username that is already taken', async () => {
    await makeUser({ username: 'taken-name' });

    await expect(
      authRepository.insertUser(
        'taken-name',
        'fake-argon2-hash',
        'a-different-address@example.test',
      ),
    ).rejects.toBeInstanceOf(ExistingAccountError);
  });

  it('does not report a missing required field as a taken username', async () => {
    const error = await authRepository
      .insertUser('user-without-an-email', 'fake-argon2-hash', null)
      .catch((err) => err);

    // createErrorHandler turns err.statusCode into the HTTP status, so an
    // error carrying no statusCode becomes a 500. That is the consequence
    // worth pinning: a malformed insert must not surface to the caller as a
    // 409 conflict claiming the account already exists.
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ExistingAccountError);
    expect(error.statusCode).toBeUndefined();
  });
});
