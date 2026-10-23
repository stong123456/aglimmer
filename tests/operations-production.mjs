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
const users = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'operator@example.test',
    product: 'operator-product',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'owner@example.test',
    product: 'owner-product',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'other@example.test',
    product: 'other-product',
  },
];
const expires = Math.floor(Date.now() / 1000) + 3600;
const token = (u) =>
  Buffer.from('{}').toString('base64url') +
  '.' +
  Buffer.from(
    JSON.stringify({
      sub: u.id,
      exp: expires,
      iss: 'https://project.supabase.co/auth/v1',
      aud: 'authenticated',
      role: 'authenticated',
    }),
  ).toString('base64url') +
  '.synthetic-test-signature';
const providerUser = (u) => ({
  id: u.id,
  email: u.email,
  aud: 'authenticated',
  role: 'authenticated',
  email_confirmed_at: '2026-10-23T00:00:00Z',
  app_metadata: { provider: 'email' },
  user_metadata: {},
  created_at: '2026-10-23T00:00:00Z',
});
const mf = new Miniflare({
  modules,
  modulesRoot: root,
  compatibilityDate: '2026-05-15',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'operations-isolated-test' },
  r2Buckets: ['BUCKET'],
  cf: false,
  bindings: {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_test_only',
    ADMIN_USER_IDS: 'operator-product',
  },
  outboundService: async (req) => {
    const url = new URL(req.url);
    assert.equal(url.hostname, 'project.supabase.co');
    if (url.pathname.endsWith('/verify')) {
      const body = await req.json(),
        u = users.find((u) => u.email === body.email);
      if (!u || body.token !== '012345') return Response.json({ msg: 'Invalid' }, { status: 403 });
      return Response.json({
        access_token: token(u),
        refresh_token: 'synthetic-refresh-' + u.product,
        expires_in: 3600,
        expires_at: expires,
        token_type: 'bearer',
        user: providerUser(u),
      });
    }
    if (url.pathname.endsWith('/user')) {
      const u = users.find((u) => req.headers.get('authorization') === 'Bearer ' + token(u));
      return u
        ? Response.json(providerUser(u))
        : Response.json({ msg: 'Invalid' }, { status: 401 });
    }
    if (url.pathname.endsWith('/logout')) return new Response(null, { status: 204 });
    throw Error('Unexpected provider operation; tests must never send real mail');
  },
});
function client() {
  const jar = new Map();
  return async (route, method = 'GET', body, origin) => {
    const headers = {};
    if (jar.size) headers.cookie = [...jar].map(([k, v]) => k + '=' + v).join('; ');
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (origin) headers.origin = origin;
    const r = await mf.dispatchFetch('https://localhost' + route, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of r.headers.getSetCookie()) {
      const [part] = c.split(';'),
        at = part.indexOf('=');
      const n = part.slice(0, at),
        v = part.slice(at + 1);
      if (v) jar.set(n, v);
      else jar.delete(n);
    }
    const raw = await r.text();
    let d = null;
    try {
      d = raw ? JSON.parse(raw) : null;
    } catch {
      throw Error(`${method} ${route} returned non-JSON status ${r.status}`);
    }
    return { r, d };
  };
}
try {
  const { DB, BUCKET } = await mf.getBindings();
  for (const file of (await fs.readdir('drizzle')).filter((x) => x.endsWith('.sql')).sort())
    for (const sql of (await fs.readFile('drizzle/' + file, 'utf8'))
      .split('--> statement-breakpoint')
      .map((x) => x.trim())
      .filter(Boolean))
      await DB.prepare(sql).run();
  for (const u of users) {
    await DB.prepare('INSERT INTO profiles(id,nickname,created_at) VALUES(?,?,?)')
      .bind(u.product, u.product, '2026-10-23T00:00:00Z')
      .run();
    await DB.prepare('INSERT INTO auth_identities(subject,user_id,created_at) VALUES(?,?,?)')
      .bind('supabase:' + u.id, u.product, '2026-10-23T00:00:00Z')
      .run();
  }
  const anonymous = client(),
    admin = client(),
    owner = client(),
    other = client();
  for (const [i, c] of [admin, owner, other].entries())
    assert.equal(
      (await c('/api/auth/verify', 'POST', { email: users[i].email, token: '012345' })).r.status,
      200,
    );
  for (const endpoint of ['/api/admin', '/api/admin/closures', '/api/admin/readiness']) {
    assert.equal((await anonymous(endpoint)).r.status, 401);
    assert.equal((await owner(endpoint)).r.status, 403);
  }
  const readiness = (await admin('/api/admin/readiness')).d;
  assert.equal(readiness.checks.storage, true);
  assert.equal(readiness.checks.moderators, true);
  assert.equal(readiness.checks.emailDeliveryVerified, false);
  assert.equal(readiness.checks.restoreVerified, false);
  assert.ok(!JSON.stringify(readiness).includes('operator-product'));
  console.log('PASS production administrative authorization and honest launch readiness');
  async function voice(id, who, visibility = 'public', status = 'pending', parent = null) {
    await DB.prepare(
      `INSERT INTO voices(id,owner_id,title,signature,recorded_at,created_at,mood,transcript,source,duration,size,audio_key,mime,visibility,status,parent_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        id,
        who,
        id,
        who,
        '2026-10-23',
        '2026-10-23T00:00:00Z',
        '有点累',
        '',
        '',
        3,
        4,
        'test-objects/' + id,
        'audio/wav',
        visibility,
        status,
        parent,
      )
      .run();
    await BUCKET.put('test-objects/' + id, new Uint8Array([1, 2, 3, 4]));
  }
  for (let i = 0; i < 45; i++) await voice('review-' + String(i).padStart(3, '0'), 'other-product');
  await voice('private-invisible', 'other-product', 'private', 'private');
  for (let i = 0; i < 25; i++) {
    const id = 'message-' + String(i).padStart(3, '0');
    await DB.prepare(
      "INSERT INTO messages(id,owner_id,topic,kind,body,signature,created_at,status) VALUES(?,?,'casual','text','QA','QA',?,'pending')",
    )
      .bind(id, 'other-product', '2026-10-23T00:00:00Z')
      .run();
    await DB.prepare(
      "INSERT INTO reports(id,user_id,voice_id,reason,created_at) VALUES(?,?,'review-000','QA',?)",
    )
      .bind('report-' + i, 'other-product', '2026-10-23T00:00:00Z')
      .run();
  }
  const first = (await admin('/api/admin?status=pending')).d,
    second = (await admin('/api/admin?status=pending&voicePage=1&messagePage=1&reportPage=1')).d;
  assert.equal(first.voices.length, 20);
  assert.equal(first.pagination.voices.total, 45);
  assert.equal(first.pending.voices, 45);
  assert.equal(second.voices.length, 20);
  assert.equal(second.messages.length, 5);
  assert.equal(second.reports.length, 5);
  assert.ok(!second.voices.some((v) => first.voices.some((x) => x.id === v.id)));
  assert.equal((await admin('/api/admin?status=private')).r.status, 400);
  assert.equal((await admin('/api/admin?voicePage=-1')).r.status, 400);
  assert.equal((await admin('/api/admin?status=approved')).d.voices.length, 0);
  assert.ok(!JSON.stringify(first).includes('private-invisible'));
  console.log(
    'PASS stable paged review across voices, messages and reports; full counts and private exclusion',
  );
  assert.equal(
    (await other('/api/voices/private-invisible', 'PATCH', { action: 'report', reason: 'private' }))
      .r.status,
    403,
  );
  await DB.prepare(
    "INSERT INTO reports(id,user_id,voice_id,reason,created_at) VALUES('legacy-private-report','other-product','private-invisible','legacy','2026-10-24')",
  ).run();
  const legacy = (await admin('/api/admin')).d.reports.find(
    (r) => r.id === 'legacy-private-report',
  );
  assert.equal(legacy.title, '内容已撤回或不可用');
  console.log(
    'PASS private voice titles remain hidden from moderators even through legacy reports',
  );
  assert.equal((await anonymous('/api/me/closure')).r.status, 401);
  assert.equal((await owner('/api/me/closure', 'POST', { confirmation: 'wrong' })).r.status, 400);
  assert.equal(
    (await owner('/api/me/closure', 'POST', { confirmation: 'CLOSE' }, 'https://foreign.invalid')).r
      .status,
    403,
  );
  assert.equal((await owner('/api/me/closure', 'POST', { confirmation: 'CLOSE' })).r.status, 200);
  const pending = (await owner('/api/me/closure')).d;
  assert.equal(pending.request.status, 'requested');
  assert.ok(!('object_keys' in pending.request));
  assert.equal((await other('/api/me/closure')).d.request, null);
  assert.equal((await owner('/api/me/closure', 'DELETE')).r.status, 200);
  assert.equal((await admin('/api/admin/closures')).d.requests.length, 0);
  await owner('/api/me/closure', 'POST', { confirmation: 'CLOSE' });
  assert.equal(
    (await owner('/api/me/closure', 'POST', { confirmation: 'CLOSE' })).d.created,
    false,
  );
  assert.equal((await admin('/api/admin/closures')).d.requests[0].providerUserId, users[1].id);
  console.log(
    'PASS user closure request is authenticated, idempotent, owner-only, revocable and does not immediately delete',
  );
  await voice('owner-public', 'owner-product');
  await voice('owner-private', 'owner-product', 'private', 'private');
  await voice('other-reply', 'other-product', 'public', 'approved', 'owner-public');
  await DB.prepare(
    "INSERT INTO messages(id,owner_id,topic,kind,body,signature,created_at,status,media_key,mime) VALUES('owner-image','owner-product','casual','image','','owner','2026-10-23','approved','test-objects/owner-image','image/png')",
  ).run();
  await BUCKET.put('test-objects/owner-image', 'test image');
  await BUCKET.put('test-objects/owner-avatar', 'test avatar');
  await DB.prepare(
    "UPDATE profiles SET avatar_key='test-objects/owner-avatar',avatar_mime='image/png' WHERE id='owner-product'",
  ).run();
  await DB.prepare(
    "INSERT INTO reactions(user_id,voice_id,kind,created_at) VALUES('other-product','owner-public','heart','2026-10-23')",
  ).run();
  assert.equal(
    (
      await admin('/api/admin/closures', 'POST', {
        userId: 'owner-product',
        confirmation: 'DELETE',
      })
    ).r.status,
    400,
  );
  assert.equal(
    (
      await admin('/api/admin/closures', 'POST', {
        userId: 'other-product',
        confirmation: 'DELETE',
        providerRemoved: true,
      })
    ).r.status,
    409,
  );
  assert.ok(await DB.prepare("SELECT id FROM profiles WHERE id='other-product'").first());
  const done = await admin('/api/admin/closures', 'POST', {
    userId: 'owner-product',
    confirmation: 'DELETE',
    providerRemoved: true,
  });
  assert.equal(done.r.status, 200, JSON.stringify(done.d));
  for (const table of ['voices', 'messages'])
    assert.equal(
      (await DB.prepare(`SELECT COUNT(*) n FROM ${table} WHERE owner_id='owner-product'`).first())
        .n,
      0,
    );
  assert.equal(await DB.prepare("SELECT id FROM profiles WHERE id='owner-product'").first(), null);
  for (const id of ['owner-public', 'owner-private', 'owner-image', 'owner-avatar'])
    assert.equal(await BUCKET.head('test-objects/' + id), null);
  assert.ok(await BUCKET.head('test-objects/other-reply'));
  assert.equal(
    (await DB.prepare("SELECT parent_id FROM voices WHERE id='other-reply'").first()).parent_id,
    null,
  );
  assert.equal((await owner('/api/me')).d.user, null);
  assert.equal(await DB.prepare("SELECT id FROM profiles WHERE id='owner-product'").first(), null);
  assert.equal((await admin('/api/admin/closures')).d.requests.length, 0);
  console.log(
    'PASS confirmed closure purges own content and files, preserves others and blocks stale identity resurrection',
  );
  await BUCKET.put('test-objects/retry-leftover', 'remaining');
  await DB.prepare(
    "INSERT INTO account_closures(user_id,status,requested_at,updated_at,object_keys) VALUES('interrupted','processing','2026-10-23','2026-10-23',?)",
  )
    .bind(JSON.stringify(['test-objects/retry-leftover']))
    .run();
  assert.equal(
    (
      await admin('/api/admin/closures', 'POST', {
        userId: 'interrupted',
        confirmation: 'DELETE',
        providerRemoved: true,
      })
    ).r.status,
    200,
  );
  assert.equal(await BUCKET.head('test-objects/retry-leftover'), null);
  await admin('/api/me/closure', 'POST', { confirmation: 'CLOSE' });
  assert.equal(
    (
      await admin('/api/admin/closures', 'POST', {
        userId: 'operator-product',
        confirmation: 'DELETE',
        providerRemoved: true,
      })
    ).r.status,
    400,
  );
  console.log(
    'PASS persisted interrupted cleanup can resume; administrators cannot accidentally delete themselves',
  );
} finally {
  await mf.dispose();
}
