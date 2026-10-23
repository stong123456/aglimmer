import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import path from 'node:path';
import fs from 'node:fs/promises';
const root = path.resolve('dist/server');
const names = (await fs.readdir(root, { recursive: true })).filter((p) => /\.m?js$/.test(p));
names.sort((a, b) => (a === 'index.js' ? -1 : b === 'index.js' ? 1 : a.localeCompare(b)));
const modules = await Promise.all(
  names.map(async (name) => ({
    type: 'ESModule',
    path: path.join(root, name),
    contents: await fs.readFile(path.join(root, name), 'utf8'),
  })),
);
const common = {
  modules,
  modulesRoot: root,
  compatibilityDate: '2026-05-15',
  compatibilityFlags: ['nodejs_compat'],
  r2Buckets: ['BUCKET'],
  cf: false,
};
let mf = new Miniflare({ ...common, d1Databases: { DB: 'auth-no-provider' } });
try {
  const s = await mf.dispatchFetch('https://localhost/api/auth/status');
  const d = await s.json();
  assert.equal(d.localDemo, false);
  assert.equal(d.ready, false);
  assert.equal(
    (
      await mf.dispatchFetch('https://localhost/api/auth/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    ).status,
    404,
  );
  const me = await mf.dispatchFetch('https://localhost/api/me', {
    headers: {
      'oai-authenticated-user-id': 'local_seedy',
      'oai-authenticated-user-email': 'seedy@sites.test',
      cookie: '__sites_local_auth=1',
    },
  });
  assert.equal((await me.json()).user, null);
  console.log('PASS production demo disabled; forged dispatch headers ignored');
} finally {
  await mf.dispose();
}
// Synthetic provider is scoped to this test only. No real email or network call.
const uid = '00000000-0000-4000-8000-000000000001',
  exp = Math.floor(Date.now() / 1000) + 3600;
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
  '.test-signature';
let email = 'owner@example.com',
  revoked = false,
  calls = 0;
const user = () => ({
  id: uid,
  email,
  aud: 'authenticated',
  role: 'authenticated',
  email_confirmed_at: '2026-10-12T00:00:00Z',
  app_metadata: { provider: 'email' },
  user_metadata: {},
  created_at: '2026-10-12T00:00:00Z',
});
mf = new Miniflare({
  ...common,
  d1Databases: { DB: 'auth-with-mock-provider' },
  bindings: {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_public_key_only',
  },
  outboundService: async (request) => {
    const url = new URL(request.url);
    assert.equal(url.hostname, 'project.supabase.co');
    calls++;
    if (url.pathname.endsWith('/otp')) return Response.json({ user: null, session: null });
    if (url.pathname.endsWith('/verify')) {
      const b = await request.json();
      if (b.token !== '01234567') return Response.json({ msg: 'Invalid OTP' }, { status: 403 });
      return Response.json({
        access_token: token,
        refresh_token: 'test-refresh-only',
        expires_in: 3600,
        expires_at: exp,
        token_type: 'bearer',
        user: user(),
      });
    }
    if (url.pathname.endsWith('/user'))
      return !revoked && request.headers.get('authorization') === 'Bearer ' + token
        ? Response.json(user())
        : Response.json({ msg: 'Invalid token' }, { status: 401 });
    if (url.pathname.endsWith('/logout')) {
      revoked = true;
      return new Response(null, { status: 204 });
    }
    throw Error('Unexpected mock-provider request');
  },
});
try {
  const { DB } = await mf.getBindings();
  for (const file of (await fs.readdir('drizzle')).filter((x) => x.endsWith('.sql')).sort())
    for (const sql of (await fs.readFile('drizzle/' + file, 'utf8'))
      .split('--> statement-breakpoint')
      .map((x) => x.trim())
      .filter(Boolean))
      await DB.prepare(sql).run();
  const jar = new Map();
  async function request(path, method = 'GET', body, withCookies = true) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (withCookies && jar.size)
      headers.cookie = Array.from(jar, ([k, v]) => k + '=' + v).join('; ');
    const r = await mf.dispatchFetch('https://localhost' + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const cookie of r.headers.getSetCookie()) {
      const pair = cookie.split(';')[0],
        at = pair.indexOf('='),
        name = pair.slice(0, at),
        value = pair.slice(at + 1);
      if (value) jar.set(name, value);
      else jar.delete(name);
    }
    const raw = await r.clone().text();
    return { r, d: raw ? JSON.parse(raw) : null };
  }
  assert.equal((await request('/api/auth/status')).d.ready, true);
  assert.equal((await request('/api/auth/send', 'POST', { email })).r.status, 200);
  assert.equal((await request('/api/auth/send', 'POST', { email })).r.status, 429);
  const callsBeforeTruncatedCode = calls;
  assert.equal(
    (await request('/api/auth/verify', 'POST', { email, token: '0123456' })).r.status,
    400,
  );
  assert.equal(calls, callsBeforeTruncatedCode, 'truncated code must not reach the provider');
  assert.equal(
    (await request('/api/auth/verify', 'POST', { email, token: '111111' })).r.status,
    400,
  );
  const verified = await request('/api/auth/verify', 'POST', { email, token: '01234567' });
  assert.equal(verified.r.status, 200, JSON.stringify(verified.d));
  assert.equal(verified.d.isNew, true);
  assert.ok(
    verified.r.headers
      .getSetCookie()
      .some((c) => /HttpOnly/i.test(c) && /Secure/i.test(c) && /SameSite=Lax/i.test(c)),
  );
  const productId = verified.d.user.userId;
  assert.notEqual(productId, uid);
  const profile = await request('/api/me');
  assert.equal(profile.d.user.userId, productId);
  assert.equal(profile.d.user.provider, 'supabase');
  await request('/api/me', 'PATCH', { nickname: '时光里的我' });
  email = 'changed@example.com';
  const changed = await request('/api/me');
  assert.equal(changed.d.user.userId, productId);
  assert.equal(changed.d.user.nickname, '时光里的我');
  assert.equal(changed.d.user.email, email);
  const hashRows = await DB.prepare('SELECT id,count FROM auth_throttle').all();
  assert.ok(hashRows.results.every((r) => /^[a-f0-9]{64}$/.test(r.id)));
  await request('/api/auth/logout', 'POST', {});
  assert.equal(jar.size, 0);
  assert.equal((await request('/api/me')).d.user, null);
  assert.ok(calls >= 4);
  console.log(
    'PASS production OTP flow with isolated synthetic provider: cooldown, invalid code, Secure HttpOnly cookie, stable ID after email change, profile, logout',
  );
} finally {
  await mf.dispose();
}
