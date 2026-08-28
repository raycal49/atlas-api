import { hashPassword, verifyPassword } from './passwordService.js';
import { SignJWT } from 'jose';
import { InvalidCredentialsError } from '../errors/authErrors.js';

const createClaims = (id) => {
  return { id: id };
};

export const createAuthService = (authRepository, jwtSecret) => {
  const createToken = async (claims) => {
    return await new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(jwtSecret);
  };

  const issueToken = async (id) => {
    const claims = createClaims(id);

    const token = await createToken(claims);

    return token;
  };

  return {
    authenticateUser: async (name, password) => {
      const userCredentials =
        (await authRepository.findUserCredentials(name)) ?? null;

      if (!userCredentials) {
        throw new InvalidCredentialsError();
      }

      const { user_id, hash } = userCredentials;

      const queryResult = await verifyPassword(password, hash);

      if (!queryResult) {
        throw new InvalidCredentialsError();
      }

      const signedToken = await issueToken(user_id);

      return signedToken;
    },
    addUser: async (user) => {
      const hash = await hashPassword(user.password);

      const { user_id } = await authRepository.insertUser(
        user.username,
        hash,
        user.email,
      );

      const signedToken = await issueToken(user_id);

      return signedToken;
    },
  };
};
