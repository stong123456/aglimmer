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
const uid = '00000000-0000-4000-8000-000000000001',
  expires = Math.floor(Date.now() / 1000) + 3600;
const user = {
  id: uid,
  email: 'history@example.test',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: { provider: 'email' },
  user_metadata: {},
  created_at: '2026-10-23T00:00:00Z',
  email_confirmed_at: '2026-10-23T00:00:00Z',
};
const token =
  Buffer.from('{}').toString('base64url') +
  '.' +
  Buffer.from(
    JSON.stringify({
      sub: uid,
      exp: expires,
      iss: 'https://project.supabase.co/auth/v1',
      aud: 'authenticated',
      role: 'authenticated',
    }),
  ).toString('base64url') +
  '.synthetic-signature';
const mf = new Miniflare({
  modules,
  modulesRoot: root,
  compatibilityDate: '2026-05-15',
  compatibilityFlags: ['nodejs_compat'],
  cf: false,
  d1Databases: { DB: 'channel-history-isolated' },
  r2Buckets: ['BUCKET'],
  bindings: {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_history_only',
  },
  outboundService: async (req) => {
    const url = new URL(req.url);
    assert.equal(url.hostname, 'project.supabase.co');
    if (url.pathname.endsWith('/verify'))
      return Response.json({
        access_token: token,
        refresh_token: 'synthetic-only',
        expires_in: 3600,
        expires_at: expires,
        token_type: 'bearer',
        user,
      });
    if (url.pathname.endsWith('/user'))
      return req.headers.get('authorization') === 'Bearer ' + token
        ? Response.json(user)
        : Response.json({ msg: 'invalid' }, { status: 401 });
    throw Error('History tests must never send email or call real services');
  },
});
let cookie = '';
async function request(route, own = false, body) {
  const r = await mf.dispatchFetch('https://localhost' + route, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(own ? { cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { r, d: await r.json() };
}
const key = (m) => (m.kind === 'voice' ? 'v:' : 'm:') + m.id;
try {
  const { DB } = await mf.getBindings();
  for (const file of (await fs.readdir('drizzle')).filter((x) => x.endsWith('.sql')).sort())
    for (const sql of (await fs.readFile('drizzle/' + file, 'utf8'))
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean))
      await DB.prepare(sql).run();
  const login = await request('/api/auth/verify', false, { email: user.email, token: '01234567' });
  assert.equal(login.r.status, 200);
  const owner = login.d.user.userId;
  cookie = login.r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  await DB.prepare(
    "INSERT INTO profiles(id,nickname,created_at) VALUES('other','other','2026-10-23')",
  ).run();
  const at = '2026-10-23T00:00:00.000Z',
    expected = [];
  async function insert(
    id,
    kind = 'text',
    who = 'other',
    status = 'approved',
    visibility = 'public',
    created = at,
    topic = 'casual',
  ) {
    if (kind === 'voice')
      await DB.prepare(
        'INSERT INTO voices(id,owner_id,title,signature,recorded_at,created_at,mood,transcript,duration,size,audio_key,mime,visibility,status,topic) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
        .bind(
          id,
          who,
          id,
          who,
          '2026-10-23',
          created,
          '需要勇气',
          'history QA',
          3,
          4,
          'test/' + id,
          'audio/wav',
          visibility,
          status,
          topic,
        )
        .run();
    else
      await DB.prepare(
        'INSERT INTO messages(id,owner_id,topic,kind,body,signature,created_at,status) VALUES(?,?,?,?,?,?,?,?)',
      )
        .bind(id, who, topic, kind, id, who, created, status)
        .run();
    return { id, kind, createdAt: created };
  }
  for (let i = 0; i < 130; i++)
    expected.push(
      await insert(
        'item-' + String(i).padStart(3, '0'),
        i % 3 === 0 ? 'voice' : i % 2 === 0 ? 'image' : 'text',
      ),
    );
  expected.push(await insert('shared', 'text'), await insert('shared', 'voice'));
  await insert('other-pending', 'text', 'other', 'pending');
  await insert('other-rejected', 'voice', 'other', 'rejected');
  await insert('private-own', 'voice', owner, 'approved', 'private');
  await insert('private-other', 'voice', 'other', 'approved', 'private');
  await insert('other-topic', 'text', 'other', 'approved', 'public', at, 'infp');
  await insert('own-pending', 'text', owner, 'pending');
  await insert('own-rejected', 'voice', owner, 'rejected');
  const first = await request('/api/channels/casual');
  assert.equal(first.r.status, 200);
  assert.equal(first.d.messages.length, 60);
  assert.ok(first.d.nextCursor);
  const collected = [...first.d.messages];
  let cursor = first.d.nextCursor,
    pages = 1;
  await insert('newer', 'text', 'other', 'approved', 'public', '2026-10-24T00:00:00.000Z');
  const boundary = first.d.messages[0];
  await DB.prepare(`DELETE FROM ${boundary.kind === 'voice' ? 'voices' : 'messages'} WHERE id=?`)
    .bind(boundary.id)
    .run();
  while (cursor) {
    assert.ok(pages < 10, 'pagination must terminate');
    const page = await request('/api/channels/casual?before=' + encodeURIComponent(cursor));
    assert.equal(page.r.status, 200);
    assert.ok(page.d.messages.length <= 60);
    assert.equal(
      new Set([...collected, ...page.d.messages].map(key)).size,
      collected.length + page.d.messages.length,
      'pages must not overlap',
    );
    collected.push(...page.d.messages);
    cursor = page.d.nextCursor;
    pages++;
  }
  assert.equal(pages, 3);
  assert.deepEqual(
    collected.map(key).sort(),
    expected.map(key).sort(),
    'mixed timestamp ties must not omit messages',
  );
  const latest = await request('/api/channels/casual');
  assert.ok(latest.d.messages.some((m) => m.id === 'newer'));
  assert.ok(collected.some((m) => m.id === 'shared' && m.kind === 'voice'));
  assert.ok(collected.some((m) => m.id === 'shared' && m.kind === 'text'));
  console.log(
    'PASS 132 mixed messages, timestamp ties, colliding IDs, deleted boundary and concurrent insertion',
  );
  const own = [];
  cursor = null;
  do {
    const page = await request(
      '/api/channels/casual' + (cursor ? '?before=' + encodeURIComponent(cursor) : ''),
      true,
    );
    assert.equal(page.r.status, 200);
    own.push(...page.d.messages);
    cursor = page.d.nextCursor;
  } while (cursor);
  assert.equal(own.filter((m) => m.id === 'own-pending' || m.id === 'own-rejected').length, 2);
  assert.ok(own.filter((m) => m.id.startsWith('own-')).every((m) => m.mine));
  for (const id of [
    'other-pending',
    'other-rejected',
    'private-own',
    'private-other',
    'other-topic',
  ])
    assert.ok(!own.some((m) => m.id === id));
  for (const id of [
    'own-pending',
    'own-rejected',
    'other-pending',
    'other-rejected',
    'private-own',
    'private-other',
  ])
    assert.ok(!collected.some((m) => m.id === id));
  for (const before of [
    '',
    'not-a-cursor',
    'a'.repeat(513),
    Buffer.from(JSON.stringify([at, 'private', 'one'])).toString('base64url'),
  ])
    assert.equal((await request('/api/channels/casual?before=' + before)).r.status, 400);
  assert.equal((await request('/api/channels/missing')).r.status, 404);
  assert.deepEqual((await request('/api/channels/goodnight')).d, {
    messages: [],
    nextCursor: null,
  });
  console.log(
    'PASS every history page preserves author-only moderation visibility and excludes private recordings; invalid cursors rejected',
  );
} finally {
  await mf.dispose();
}
