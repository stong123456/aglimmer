import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5173';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname))
  throw Error('Local tests only');
const headers = { cookie: '__sites_local_auth=1' };
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf6kAAAAASUVORK5CYII=',
  'base64',
);
const initial = await (await fetch(base + '/api/me', { headers })).json();
if (initial.user?.userId !== 'local_seedy')
  throw Error('Avatar smoke test requires the local demo identity.');
if (initial.user.avatarUrl)
  throw Error('Local account already has an avatar. Test stopped to preserve it.');
async function upload(bytes = pixel, mime = 'image/png') {
  const f = new FormData();
  f.set('avatar', new Blob([bytes], { type: mime }), 'avatar');
  return fetch(base + '/api/me/avatar', { method: 'POST', headers, body: f });
}
try {
  assert.equal((await fetch(base + '/api/me/avatar')).status, 401);
  assert.equal((await upload(Buffer.from('<svg/>'), 'image/svg+xml')).status, 400);
  assert.equal((await upload(Buffer.from('fake'), 'image/png')).status, 400);
  const r = await upload();
  assert.equal(r.status, 201);
  const d = await r.json();
  assert.ok(d.avatarUrl);
  const me = await (await fetch(base + '/api/me', { headers })).json();
  assert.equal(me.user.avatarUrl, d.avatarUrl);
  const image = await fetch(base + d.avatarUrl, { headers });
  assert.equal(image.status, 200);
  assert.ok(image.headers.get('cache-control').includes('private'));
  assert.ok(image.headers.get('cache-control').includes('no-store'));
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), pixel);
  assert.equal((await fetch(base + d.avatarUrl)).status, 401);
  const archive = await (await fetch(base + '/api/export', { headers })).json();
  assert.ok(archive.profile.avatarUrl);
  assert.ok(!('avatar_key' in archive.profile));
  const replacement = await upload();
  assert.equal(replacement.status, 201);
  assert.notEqual((await replacement.json()).avatarUrl, d.avatarUrl);
  assert.equal((await fetch(base + '/api/me/avatar', { method: 'DELETE', headers })).status, 200);
  assert.equal((await fetch(base + '/api/me/avatar', { headers })).status, 404);
  assert.equal((await (await fetch(base + '/api/me', { headers })).json()).user.avatarUrl, null);
  console.log(
    'PASS avatar auth, raster validation, upload/read, private caching, replacement, export and deletion',
  );
} finally {
  await fetch(base + '/api/me/avatar', { method: 'DELETE', headers });
}
