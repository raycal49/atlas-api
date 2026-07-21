import { ExistingAccountError } from '../errors/authErrors.js';

export const createAuthRepository = (sql) => ({
  findUserCredentials: async (name) => {
    const rows = await sql`SELECT user_id, hash FROM users WHERE username = ${name}`;
    return rows[0];
  },
  checkUserExists: async (name) => {
    const rows = await sql`SELECT EXISTS (
    SELECT 1 FROM users WHERE username = ${name}
    )`;

    return rows[0].exists;
  },
  insertUser: async (username, hash, email) => {
    try {
      const rows = await sql`
        INSERT INTO users (username, hash, email)
        VALUES (${username}, ${hash}, ${email})
        RETURNING user_id
        `
        
      // console.log("insertUser rows:", rows)
      // console.log("insertUser rows[0]:", rows[0])


        return rows[0];
    } catch (err) {
      // console.log("error's code is", err.code)
      // console.log("constraint:", err.constraint)
      // console.log("detail:", err.detail)

      if (err.code === '23505')
        throw new ExistingAccountError("Account with this username already exists");
      else
        throw err;
    }
  }
});
