import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import fs from 'node:fs/promises';
import path from 'node:path';
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
const expires = Math.floor(Date.now() / 1000) + 3600;
const users = ['A', 'B'].map((label, i) => ({
  id: '00000000-0000-4000-8000-00000000000' + (i + 1),
  email: label.toLowerCase() + '@example.test',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: { provider: 'email' },
  user_metadata: {},
  created_at: '2026-10-23T00:00:00Z',
  email_confirmed_at: '2026-10-23T00:00:00Z',
}));
const tokens = users.map(
  (u) =>
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
    '.synthetic-signature',
);
const mf = new Miniflare({
  modules,
  modulesRoot: root,
  compatibilityDate: '2026-05-15',
  compatibilityFlags: ['nodejs_compat'],
  cf: false,
  d1Databases: { DB: 'release-isolated' },
  r2Buckets: ['BUCKET'],
  bindings: {
    ADMIN_USER_IDS: users[0].id,
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_only',
  },
  outboundService: async (req) => {
    const url = new URL(req.url);
    assert.equal(url.hostname, 'project.supabase.co');
    if (url.pathname.endsWith('/verify')) {
      const body = await req.json();
      const i = users.findIndex((u) => u.email === body.email);
      assert.ok(i >= 0);
      return Response.json({
        access_token: tokens[i],
        refresh_token: 'synthetic-' + i,
        expires_in: 3600,
        expires_at: expires,
        token_type: 'bearer',
        user: users[i],
      });
    }
    if (url.pathname.endsWith('/user')) {
      const i = tokens.findIndex((t) => 'Bearer ' + t === req.headers.get('authorization'));
      return i >= 0 ? Response.json(users[i]) : Response.json({ msg: 'invalid' }, { status: 401 });
    }
    throw Error('Release tests cannot send email or call real services');
  },
});
async function request(route, cookie = '', method = 'GET', body) {
  const r = await mf.dispatchFetch('https://localhost' + route, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { r, d: await r.json() };
}
try {
  const { DB } = await mf.getBindings();
  for (const file of (await fs.readdir('drizzle')).filter((x) => x.endsWith('.sql')).sort())
    for (const sql of (await fs.readFile('drizzle/' + file, 'utf8'))
      .split('--> statement-breakpoint')
      .map((x) => x.trim())
      .filter(Boolean))
      await DB.prepare(sql).run();
  for (const user of users) {
    await DB.prepare('INSERT INTO profiles(id,nickname,created_at) VALUES(?,?,?)')
      .bind(user.id, 'Synthetic test reader', '2026-10-23')
      .run();
    await DB.prepare('INSERT INTO auth_identities(subject,user_id,created_at) VALUES(?,?,?)')
      .bind('supabase:' + user.id, user.id, '2026-10-23')
      .run();
  }
  const identities = [];
  for (const u of users) {
    const login = await request('/api/auth/verify', '', 'POST', {
      email: u.email,
      token: '01234567',
    });
    assert.equal(login.r.status, 200);
    identities.push({
      id: login.d.user.userId,
      cookie: login.r.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; '),
    });
  }
  const [a, b] = identities;
  async function voice(
    id,
    owner = a.id,
    {
      visibility = 'public',
      status = 'approved',
      created = '2026-10-01T00:00:00.000Z',
      topic = 'infp',
      duration = 3,
      title = id,
      transcript = 'A little light',
      featured = 1,
    } = {},
  ) {
    await DB.prepare(
      'INSERT INTO voices(id,owner_id,title,signature,recorded_at,created_at,mood,transcript,duration,size,audio_key,mime,visibility,status,topic,featured) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    )
      .bind(
        id,
        owner,
        title,
        'Original signature',
        '2020-10-12',
        created,
        '有点累',
        transcript,
        duration,
        4,
        'test/' + id,
        'audio/wav',
        visibility,
        status,
        topic,
        featured,
      )
      .run();
  }
  await voice('private', a.id, { visibility: 'private', status: 'private' });
  assert.equal((await request('/api/voices/private', b.cookie)).r.status, 404);
  assert.equal(
    (await request('/api/voices/private', b.cookie, 'PATCH', { action: 'publish' })).r.status,
    404,
  );
  assert.equal(
    (await request('/api/voices/private', '', 'PATCH', { action: 'publish' })).r.status,
    401,
  );
  assert.equal(
    (await request('/api/voices/private', a.cookie, 'PATCH', { action: 'publish' })).r.status,
    200,
  );
  assert.equal(
    (await request('/api/voices/private')).r.status,
    404,
    'requesting publication must not publish immediately',
  );
  const pending = await request('/api/voices/private', a.cookie);
  assert.equal(pending.d.voice.status, 'pending');
  assert.equal(pending.d.voice.featured, 0);
  assert.equal(pending.d.voice.recordedAt, '2020-10-12');
  assert.equal(pending.d.voice.signature, 'Original signature');
  assert.equal(
    pending.d.voice.createdAt,
    '2026-10-01T00:00:00.000Z',
    'publication must preserve storage timestamp',
  );
  await request('/api/voices/private', a.cookie, 'PATCH', { action: 'publish' });
  assert.equal(
    (await DB.prepare("SELECT COUNT(*) n FROM audit WHERE action='request_publication'").first()).n,
    1,
    'repeated request is idempotent',
  );
  for (let i = 0; i < 9; i++) {
    await request('/api/voices/private', a.cookie, 'PATCH', { action: 'hide' });
    assert.equal(
      (await request('/api/voices/private', a.cookie, 'PATCH', { action: 'publish' })).r.status,
      200,
    );
  }
  await request('/api/voices/private', a.cookie, 'PATCH', { action: 'hide' });
  assert.equal(
    (await request('/api/voices/private', a.cookie, 'PATCH', { action: 'publish' })).r.status,
    429,
    'publication rate limit',
  );
  console.log(
    'PASS private-to-review consent endpoint, ownership, immutable dates/signature, idempotence and rate limit',
  );
  for (let i = 0; i < 135; i++)
    await voice('wall-' + String(i).padStart(3, '0'), b.id, {
      title: i === 0 ? 'MoonLight in the old archive' : i === 1 ? 'literal % and _' : 'voice ' + i,
    });
  const keys = [];
  let cursor = null,
    pages = 0;
  do {
    const result = await request(
      '/api/voices?mode=all&topic=infp' + (cursor ? '&before=' + encodeURIComponent(cursor) : ''),
    );
    assert.equal(result.r.status, 200);
    keys.push(...result.d.voices.map((v) => v.id));
    cursor = result.d.nextCursor;
    pages++;
    assert.ok(pages < 5);
  } while (cursor);
  assert.equal(keys.length, 135);
  assert.equal(new Set(keys).size, 135);
  assert.equal(pages, 3);
  assert.deepEqual(
    (await request('/api/voices?mode=all&topic=infp&q=moonlight')).d.voices.map((v) => v.id),
    ['wall-000'],
  );
  for (const q of ['%', '_'])
    assert.deepEqual(
      (await request('/api/voices?mode=all&topic=infp&q=' + encodeURIComponent(q))).d.voices.map(
        (v) => v.id,
      ),
      ['wall-001'],
    );
  await voice('pod-short', b.id, { topic: 'podcast', duration: 599 });
  await voice('pod-long', b.id, { topic: 'podcast', duration: 600 });
  await voice('pod-private', a.id, {
    topic: 'podcast',
    duration: 700,
    visibility: 'private',
    status: 'private',
  });
  assert.deepEqual(
    (await request('/api/voices?mode=all&topic=podcast&length=short')).d.voices.map((v) => v.id),
    ['pod-short'],
  );
  assert.deepEqual(
    (await request('/api/voices?mode=all&topic=podcast&length=long')).d.voices.map((v) => v.id),
    ['pod-long'],
  );
  assert.ok(!(await request('/api/voices?mode=all')).d.voices.some((v) => v.topic === 'podcast'));
  for (const query of ['before=bad', 'mode=invalid', 'length=invalid', 'q=' + 'a'.repeat(101)])
    assert.equal((await request('/api/voices?' + query)).r.status, 400);
  const withdrawn = (await request('/api/classics')).d.hidden;
  assert.equal(withdrawn.length, 320);
  assert.ok(withdrawn.includes('clouds'));
  const activeCatalog = (await request('/api/classics?catalog=1')).d.items;
  assert.ok(activeCatalog.length >= 480);
  assert.ok(activeCatalog.some((q) => q.id === 'lv-zh-prose-gesheng'));
  assert.ok(activeCatalog.some((q) => q.id === 'lv-zh-prose-congcong'));
  assert.ok(!activeCatalog.some((q) => q.originalLanguage === 'zh' && q.kind === 'poetry'));
  assert.equal(
    (await request('/api/admin', a.cookie, 'POST', { action: 'restore_classic', id: 'clouds' })).r
      .status,
    409,
  );
  assert.equal(
    (
      await request('/api/classics/report', '', 'POST', {
        id: 'missing',
        reason: 'A legitimate source attribution concern',
      })
    ).r.status,
    404,
  );
  assert.equal(
    (await request('/api/classics/report', '', 'POST', { id: 'jobs', reason: 'short' })).r.status,
    400,
  );
  assert.equal(
    (
      await request('/api/classics/report', '', 'POST', {
        id: 'jobs',
        reason: 'Please check the original channel attribution.',
      })
    ).r.status,
    201,
  );
  assert.equal(
    (
      await request('/api/classics/report', '', 'POST', {
        id: 'jobs',
        reason: 'Please check this same attribution again.',
      })
    ).d.duplicate,
    true,
  );
  assert.equal(
    (await request('/api/admin', b.cookie, 'POST', { action: 'hide_classic', id: 'jobs' })).r
      .status,
    403,
  );
  assert.equal(
    (await request('/api/admin', a.cookie, 'POST', { action: 'hide_classic', id: 'jobs' })).r
      .status,
    200,
  );
  assert.deepEqual((await request('/api/classics')).d.hidden, [...withdrawn, 'jobs']);
  assert.ok(!(await request('/api/classics?catalog=1')).d.items.some((q) => q.id === 'jobs'));
  const review = await request('/api/admin', a.cookie);
  assert.ok(review.d.reports.some((r) => r.voice_id === 'quote:jobs' && r.classicHidden));
  assert.equal(
    (await request('/api/admin', a.cookie, 'POST', { action: 'restore_classic', id: 'jobs' })).r
      .status,
    200,
  );
  assert.deepEqual((await request('/api/classics')).d.hidden, withdrawn);
  console.log(
    'PASS public source reports, duplicate handling, admin-only takedown, audit trail and restoration',
  );
  console.log(
    'PASS 135 public voices across three pages, case-insensitive cross-page search, literal wildcards and server-side podcast length filters',
  );
} finally {
  await mf.dispose();
}
