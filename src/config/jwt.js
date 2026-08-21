export const createJwtSecret = (rawSecret = process.env.JWT_SECRET) => {
  if (!rawSecret) {
    throw new Error('JWT_SECRET is required');
  }

  return new TextEncoder().encode(rawSecret);
};
