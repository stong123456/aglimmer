import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5173';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw Error('Local-only');
async function call(path, method = 'GET', body, headers = {}) {
  const r = await fetch(base + path, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await r.clone().text();
  return { r, d: raw ? JSON.parse(raw) : null };
}
const status = await call('/api/auth/status');
assert.equal(status.r.status, 200);
assert.ok(!('key' in status.d));
assert.ok(!('url' in status.d));
if (status.d.ready) {
  console.log('Real provider configured: synthetic email tests skipped to avoid sending mail.');
  process.exit(0);
}
assert.equal((await call('/api/auth/send', 'POST', { email: 'bad' })).r.status, 400);
assert.equal((await call('/api/auth/send', 'POST', { email: 'you@example.com' })).r.status, 503);
assert.equal(
  (await call('/api/auth/verify', 'POST', { email: 'you@example.com', token: '123456' })).r.status,
  503,
);
assert.equal(
  (await call('/api/auth/verify', 'POST', { email: 'you@example.com', token: '123' })).r.status,
  400,
);
assert.equal((await call('/api/auth/local', 'GET')).r.status, 405);
const local = await call('/api/auth/local', 'POST', {});
assert.equal(local.r.status, 200);
const cookie = local.r.headers.getSetCookie().find((c) => c.startsWith('__sites_local_auth='));
assert.ok(cookie);
assert.match(cookie, /HttpOnly/i);
assert.match(cookie, /SameSite=Lax/i);
const me = await call('/api/me', 'GET', undefined, { cookie: cookie.split(';')[0] });
assert.equal(me.d.user?.provider, 'local');
const out = await call('/api/auth/logout', 'POST', {}, { cookie: cookie.split(';')[0] });
assert.equal(out.r.status, 200);
assert.ok(
  out.r.headers
    .getSetCookie()
    .some((c) => c.startsWith('__sites_local_auth=') && /Max-Age=0/i.test(c)),
);
console.log(
  'Auth API checks passed: missing configuration, invalid input, local cookie round trip, logout. No email was sent.',
);
