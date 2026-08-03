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
  it('returns only the generated user_id and persists the row', async () => {
    const created = await authRepository.insertUser(
      'brand-new-user',
      'fake-argon2-hash',
      'brand-new-user@example.test',
    );

    // the service layer destructures user_id off this, so the shape is a
    // contract: RETURNING user_id means one key, nothing else
    expect(created).toEqual({ user_id: expect.any(String) });

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

  it('translates a duplicate username into ExistingAccountError', async () => {
    await makeUser({ username: 'taken-name' });

    await expect(
      authRepository.insertUser(
        'taken-name',
        'fake-argon2-hash',
        'a-different-address@example.test',
      ),
    ).rejects.toBeInstanceOf(ExistingAccountError);
  });

  it('treats usernames differing only in case as duplicates', async () => {
    await makeUser({ username: 'CaseSensitiveCheck' });

    // users.username is citext, so users_username_key collides here even
    // though the two strings are not equal in JavaScript. Nothing in
    // authRepo.js says this -- it comes entirely from the column type.
    await expect(
      authRepository.insertUser(
        'casesensitivecheck',
        'fake-argon2-hash',
        'another-address@example.test',
      ),
    ).rejects.toBeInstanceOf(ExistingAccountError);
  });

  it('reports a duplicate email as a taken username', async () => {
    await makeUser({ email: 'taken-address@example.test' });

    const error = await authRepository
      .insertUser(
        'a-completely-unused-name',
        'fake-argon2-hash',
        'taken-address@example.test',
      )
      .catch((err) => err);

    // KNOWN QUIRK: users_email_key also raises 23505, and insertUser does not
    // look at which constraint fired, so an email collision is reported as a
    // username collision. Pinned as-is; change the assertion if the repo
    // starts discriminating on err.constraint_name the way userRepos does.
    expect(error).toBeInstanceOf(ExistingAccountError);
    expect(error.message).toBe(
      'Account with this username already exists',
    );
  });

  it('rethrows a NOT NULL violation untranslated', async () => {
    const error = await authRepository
      .insertUser('user-without-an-email', 'fake-argon2-hash', null)
      .catch((err) => err);

    // only 23505 is translated, so this arrives as the driver's own error.
    // ExistingAccountError carries no cause when thrown from insertUser, so
    // the presence of .code is what proves nothing translated it
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ExistingAccountError);
    expect(error.code).toBe('23502');
  });
});
