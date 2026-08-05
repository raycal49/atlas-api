const rawSecret = process.env.JWT_SECRET;

if (!rawSecret) {
  throw new Error('JWT_SECRET is required');
}

export const jwtSecret = new TextEncoder().encode(rawSecret);
