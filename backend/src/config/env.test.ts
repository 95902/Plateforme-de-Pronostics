import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveJwtSecret } from './env.js';

const strongSecret = 'a'.repeat(32);

test('production refuses missing, placeholder or short JWT secrets', () => {
  for (const JWT_SECRET of [undefined, '', 'your-secret-key-change-this-in-production', 'too-short']) {
    assert.throws(() => resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET }), /JWT_SECRET/);
  }
  assert.equal(resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: strongSecret }), strongSecret);
});

test('development falls back to a dev secret but keeps a configured one', () => {
  const fallback = resolveJwtSecret({ NODE_ENV: 'development' });
  assert.ok(fallback.length > 0);
  assert.equal(resolveJwtSecret({ NODE_ENV: 'development', JWT_SECRET: 'my-dev-secret' }), 'my-dev-secret');
});
