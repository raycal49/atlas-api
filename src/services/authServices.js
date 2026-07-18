import argon2 from "argon2";
import { SignJWT, jwtVerify } from 'jose';
import { InvalidCredentialError, ExistingAccountError } from '../errors/authErrors.js'

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

const hashPassword = (password) => {
  return argon2.hash(password, ARGON2_OPTIONS);
}

const verifyPassword = (password, passwordHash) => {
  return argon2.verify(passwordHash, password);
}

const createClaims = (id) => {
  return {"id":id};
}

const createToken = async (claims) => {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    return await new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secret)
};

const issueToken = async (id) => {
  const claims = createClaims(id);

  const token = await createToken(claims);

  return token;
}

export const createAuthServices = (authRepository) => ({
    authenticateUser: async (name, password) => {
        const userCredentials = await authRepository.findUserCredentials(name) ?? null;
        
        if (!userCredentials) {
            throw new InvalidCredentialError();
        }

        const { user_id, hash } = userCredentials;

        const queryResult = await verifyPassword(password, hash);

        if (!queryResult) {
          throw new InvalidCredentialError();
        }
        
        const signedToken = await issueToken(user_id);

        return signedToken;
    },
    addUser: async (user) => {
        const existingUser = await authRepository.checkUserExists(user.username);

        if (existingUser) {
          throw new ExistingAccountError();
        }
        
        const hash = await hashPassword(user.password);

        const {user_id} = await authRepository.insertUser(
          user.username,
          hash,
          user.email
        );

        const signedToken = await issueToken(user_id);

        return signedToken;
    },    
});

