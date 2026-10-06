import dotenv from 'dotenv';

dotenv.config();

const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret';
const PLACEHOLDER_SECRETS = ['', 'your-secret-key', 'your-secret-key-change-this-in-production', DEV_JWT_SECRET];

export const isProduction = process.env.NODE_ENV === 'production';

/**
 * Secret used to sign JWTs. In production a real secret (32+ characters) is required:
 * the server refuses to start rather than sign tokens with a guessable key.
 */
export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET ?? '';

  if (env.NODE_ENV === 'production') {
    if (PLACEHOLDER_SECRETS.includes(secret) || secret.length < 32) {
      throw new Error('JWT_SECRET must be set to a random value of at least 32 characters in production');
    }
    return secret;
  }

  if (PLACEHOLDER_SECRETS.includes(secret)) {
    console.warn('⚠️  JWT_SECRET is not set: using an insecure development secret');
    return DEV_JWT_SECRET;
  }
  return secret;
}

export const JWT_SECRET = resolveJwtSecret();
