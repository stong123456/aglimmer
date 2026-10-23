import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmail,
  validOtp,
  validSupabaseConfig,
  authCookieOptions,
  throttleHash,
} from '../lib/auth-core.ts';
import { createAuthClient } from '../lib/supabase-client.ts';
test('email normalization and OTP validation', () => {
  assert.equal(normalizeEmail(' You+voice@Example.com '), 'you+voice@example.com');
  assert.equal(normalizeEmail('bad\n@example.com'), null);
  assert.equal(normalizeEmail('no-address'), null);
  assert.ok(validOtp('012345'));
  assert.ok(validOtp('01234567'));
  assert.equal(validOtp('0123456'), false);
  assert.equal(validOtp('012345678'), false);
  assert.equal(validOtp(12345678), false);
  assert.equal(validOtp('12345'), false);
  assert.equal(validOtp('abcdef'), false);
});
test('provider configuration refuses secret role keys and unsafe URLs', () => {
  assert.ok(
    validSupabaseConfig('https://project.supabase.co', 'sb_publishable_test_public_key_only'),
  );
  assert.equal(
    validSupabaseConfig('http://project.supabase.co', 'sb_publishable_test_public_key_only'),
    false,
  );
  assert.equal(
    validSupabaseConfig(
      'https://name:password@project.supabase.co',
      'sb_publishable_test_public_key_only',
    ),
    false,
  );
  assert.equal(
    validSupabaseConfig('https://project.supabase.co', 'sb_secret_not_for_web_auth'),
    false,
  );
  const fake = (role: string) => 'header.' + btoa(JSON.stringify({ role })) + '.signature';
  assert.ok(validSupabaseConfig('https://project.supabase.co', fake('anon')));
  assert.equal(validSupabaseConfig('https://project.supabase.co', fake('service_role')), false);
});
test('session cookie policy is HttpOnly with production Secure and SameSite', () => {
  assert.deepEqual(authCookieOptions(true), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 2592000,
  });
  assert.equal(authCookieOptions(false).secure, false);
});
test('rate-limit identifiers do not store raw email', async () => {
  const a = await throttleHash('send', 'you@example.com'),
    b = await throttleHash('verify', 'you@example.com');
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.notEqual(a, b);
  assert.equal(a, await throttleHash('send', 'you@example.com'));
});
test('SDK verification writes cookies, asks provider for identity, then clears session', async () => {
  const uid = '00000000-0000-4000-8000-000000000001';
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token =
    btoa('{}') +
    '.' +
    btoa(
      JSON.stringify({
        sub: uid,
        exp,
        iss: 'https://project.supabase.co/auth/v1',
        aud: 'authenticated',
        role: 'authenticated',
      }),
    ) +
    '.fake-signature';
  const user = {
    id: uid,
    email: 'you@example.com',
    aud: 'authenticated',
    role: 'authenticated',
    email_confirmed_at: '2026-10-12T00:00:00Z',
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: '2026-10-12T00:00:00Z',
  };
  const jar = new Map<string, string>();
  const writes: any[] = [];
  const paths: string[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url).pathname;
    paths.push(path);
    if (path.endsWith('/verify')) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.type, 'email');
      assert.equal(body.token, '01234567');
      return Response.json({
        access_token: token,
        refresh_token: 'test-refresh-only',
        expires_in: 3600,
        expires_at: exp,
        token_type: 'bearer',
        user,
      });
    }
    if (path.endsWith('/user')) {
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer ' + token);
      return Response.json(user);
    }
    if (path.endsWith('/logout')) return new Response(null, { status: 204 });
    throw new Error('Unexpected provider request ' + path);
  };
  const cookies = {
    getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
    setAll: (values: any[]) => {
      for (const c of values) {
        writes.push(c);
        if (c.value) jar.set(c.name, c.value);
        else jar.delete(c.name);
      }
    },
  };
  const client = createAuthClient(
    'https://project.supabase.co',
    'sb_publishable_test_public_key_only',
    cookies,
    true,
    fakeFetch,
  );
  const verified = await client.auth.verifyOtp({
    email: 'you@example.com',
    token: '01234567',
    type: 'email',
  });
  assert.equal(verified.error, null);
  assert.equal(verified.data.user?.id, uid);
  assert.ok(
    writes.some((c) => c.options.httpOnly && c.options.secure && c.options.sameSite === 'lax'),
  );
  const me = await client.auth.getUser();
  assert.equal(me.data.user?.id, uid);
  assert.ok(paths.includes('/auth/v1/user'));
  await client.auth.signOut({ scope: 'local' });
  assert.equal(jar.size, 0);
  assert.ok(writes.some((c) => c.value === '' && c.options.maxAge === 0));
});
