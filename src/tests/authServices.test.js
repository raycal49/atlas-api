import { describe, it, expect, vi} from 'vitest';
import argon2 from 'argon2';
import { createAuthServices } from '../services/authServices';
import { InvalidCredentialError, ExistingAccountError } from '../errors/authErrors';

vi.mock('argon2', () => ({
  default: { verify: vi.fn(), hash: vi.fn(), argon2id: 2 }
}));

vi.mock('jose', () => {
  class SignJWT {
    setProtectedHeader() { return this; }
    setIssuedAt() { return this; }
    setExpirationTime() { return this; }
    sign() { return Promise.resolve('fake.jwt.token'); }
  }
  return { SignJWT, jwtVerify: vi.fn() };
});

const setup = () => {
    const authRepo = {
        findUserCredentials: vi.fn(),
        checkUserExists: vi.fn(),
        insertUser: vi.fn(),
    }

    const service = createAuthServices(authRepo);

    return { service, authRepo}
}

describe('Auth Service', async () => {
    describe('User inputs credentials and attempts to login', async () => {
        it('Input user credentials cannot be found so InvalidCredentialError is thrown', async () => {
            const { service, authRepo } = setup();
            authRepo.findUserCredentials.mockResolvedValue(undefined);
            await expect(service.authenticateUser('Ray', 'Password123!')).rejects.toThrow(InvalidCredentialError);
        }),

        it('Input user password does not match stored hash so InvalidCredentialError is thrown', async () => {
            const { service, authRepo } = setup();
            authRepo.findUserCredentials.mockResolvedValue({user_id:'14128a55-1ce9', hash:'stored_hash'});
            argon2.verify.mockResolvedValue(false);
            await expect(service.authenticateUser('Ray', 'Password123!')).rejects.toThrow(InvalidCredentialError);
            expect(argon2.verify).toHaveBeenCalledWith('stored_hash', 'Password123!');
        }),

        it('Input user password matches stored hash so a token is issued, signed, then returned', async () => {
            const { service, authRepo } = setup();
            authRepo.findUserCredentials.mockResolvedValue({user_id:'14128a55-1ce9', hash:'stored_hash'});
            argon2.verify.mockResolvedValue(true);

            const token = await service.authenticateUser('Ray', 'Password123!');

            expect(token).toBe('fake.jwt.token');
            expect(argon2.verify).toHaveBeenCalledWith('stored_hash', 'Password123!');
        })
    })

    describe('User inputs credentials and attempts to register', async () => {
        it('Input user credentials match an existing account and ExistingAccountError is thrown', async () => {
            const { service, authRepo } = setup();
            authRepo.checkUserExists.mockResolvedValue(true);

            await expect(service.addUser({username:'ray123', password:'Password123!', email: 'myemail123@gmail.com'})).rejects.toThrow(ExistingAccountError);
        }),

        it('Input user credentials are valid so their account is created and a signed token is returned', async () => {
            const { service, authRepo } = setup();
            authRepo.checkUserExists.mockResolvedValue(false);
            argon2.hash.mockResolvedValue('hash');
            authRepo.insertUser.mockResolvedValue({user_id:'14128a55-1ce9'});

            const result = await service.addUser({username:'ray123', password:'Password123!', email: 'myemail123@gmail.com'});

            expect(result).toBe('fake.jwt.token');
        })
    })
});