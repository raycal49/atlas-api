const rawSecret = process.env.JWT_SECRET;

// Read once, at import, so a misconfigured deployment fails at boot instead of
// at the first login.
//
// Without this guard the failure is silent rather than loud: encode(undefined)
// does not throw, it encodes the literal bytes of the string "undefined". Both
// the signing and the verifying side read the same missing variable, so they
// agree, tokens validate, and nothing anywhere errors. The only symptom is that
// every session in the deployment is signed with a key an attacker can guess.
if (!rawSecret) {
  throw new Error('JWT_SECRET is required');
}

// Exported already encoded so there is exactly one definition of the key. Two
// call sites deriving it independently is how they drift.
export const jwtSecret = new TextEncoder().encode(rawSecret);
