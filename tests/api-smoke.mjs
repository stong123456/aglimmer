import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5173';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname))
  throw new Error('Smoke tests are local-only and must never run against production');
const cookie = '__sites_local_auth=1';
const ids = [];
let checks = 0;
function wav(seconds) {
  const rate = 16000,
    len = Math.round(seconds * rate),
    b = new Uint8Array(44 + len * 2),
    v = new DataView(b.buffer),
    s = (o, x) => [...x].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  s(0, 'RIFF');
  v.setUint32(4, b.length - 8, true);
  s(8, 'WAVE');
  s(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  s(36, 'data');
  v.setUint32(40, len * 2, true);
  for (let i = 0; i < len; i++)
    v.setInt16(44 + i * 2, Math.sin((i / rate) * 440 * Math.PI * 2) * 1000, true);
  return b;
}
async function request(path, { auth = false, json, method = 'GET', body, origin } = {}) {
  const headers = {};
  if (auth) headers.cookie = cookie;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  if (origin) headers.origin = origin;
  const r = await fetch(base + path, { method, headers, body });
  let d;
  try {
    d = await r.clone().json();
  } catch {}
  return { r, d };
}
async function check(name, fn) {
  await fn();
  checks++;
  console.log('PASS', name);
}
function form({
  visibility = 'private',
  parentId = '',
  audio = wav(3),
  recordedAt = '2020-10-12',
  claim = '1',
} = {}) {
  const f = new FormData();
  Object.entries({
    title: 'QA · 时光回声',
    signature: '当年的测试署名',
    recordedAt,
    mood: '给未来的我',
    transcript: '这是本地自动验证数据，测试后会删除。',
    source: '',
    visibility,
    futureYear: '2036',
    parentId,
    duration: claim,
  }).forEach(([k, v]) => f.set(k, v));
  f.set('audio', new Blob([audio], { type: 'audio/wav' }), 'qa.wav');
  return f;
}
async function create(opts) {
  const { r, d } = await request('/api/voices', { auth: true, method: 'POST', body: form(opts) });
  assert.equal(r.status, 201, JSON.stringify(d));
  ids.push(d.id);
  return d.id;
}
const initial = await request('/api/me', { auth: true });
const originalName = initial.d?.user?.nickname ?? '一位留光的人';
try {
  await check('durable storage health', async () =>
    assert.equal((await request('/api/health')).r.status, 200),
  );
  await check('anonymous write and moderation denied', async () => {
    assert.equal((await request('/api/voices', { method: 'POST', body: form() })).r.status, 401);
    assert.equal((await request('/api/admin')).r.status, 401);
  });
  await check('cross-origin mutation denied', async () =>
    assert.equal(
      (
        await request('/api/me', {
          auth: true,
          method: 'PATCH',
          json: { nickname: 'QA' },
          origin: 'https://example.invalid',
        })
      ).r.status,
      403,
    ),
  );
  await check('invalid body and date rejected', async () => {
    assert.equal(
      (await request('/api/me', { auth: true, method: 'PATCH', json: null })).r.status,
      400,
    );
    assert.equal(
      (
        await request('/api/voices', {
          auth: true,
          method: 'POST',
          body: form({ recordedAt: '2026-02-30' }),
        })
      ).r.status,
      400,
    );
  });
  await check('fake audio and falsified duration rejected', async () => {
    assert.equal(
      (
        await request('/api/voices', {
          auth: true,
          method: 'POST',
          body: form({ audio: new TextEncoder().encode('<html>not audio</html>') }),
        })
      ).r.status,
      400,
    );
    assert.equal(
      (
        await request('/api/voices', {
          auth: true,
          method: 'POST',
          body: form({ audio: wav(92), claim: '2' }),
        })
      ).r.status,
      400,
    );
  });
  const privateId = await create();
  await check('private audio and metadata hidden from visitors', async () => {
    assert.equal((await request(`/api/voices/${privateId}`)).r.status, 404);
    assert.equal((await request(`/api/voices/${privateId}/audio`)).r.status, 404);
  });
  await check('audio round trip and server measured duration', async () => {
    const { r } = await request(`/api/voices/${privateId}/audio`, { auth: true });
    assert.equal(r.status, 200);
    assert.deepEqual(new Uint8Array(await r.arrayBuffer()), wav(3));
    const { d } = await request(`/api/voices/${privateId}`, { auth: true });
    assert.equal(d.voice.duration, 3);
    assert.equal(d.voice.recordedAt, '2020-10-12');
  });
  await check('signature snapshot survives profile changes', async () => {
    assert.equal(
      (
        await request('/api/me', {
          auth: true,
          method: 'PATCH',
          json: { nickname: '新的测试署名' },
        })
      ).r.status,
      200,
    );
    const { d } = await request(`/api/voices/${privateId}`, { auth: true });
    assert.equal(d.voice.signature, '当年的测试署名');
  });
  const publicId = await create({ visibility: 'public' });
  await check('pending submission is not public', async () => {
    assert.equal((await request(`/api/voices/${publicId}`)).r.status, 404);
    const { d } = await request('/api/me', { auth: true });
    assert.equal(d.voices.find((x) => x.id === publicId).status, 'pending');
  });
  await check('moderator approves and features on homepage', async () => {
    const { r, d } = await request('/api/admin', {
      auth: true,
      method: 'POST',
      json: { id: publicId, action: 'feature', note: '本地测试' },
    });
    assert.equal(r.status, 200, JSON.stringify(d));
    assert.equal((await request(`/api/voices/${publicId}`)).r.status, 200);
    const feed = await request('/api/voices');
    assert.ok(feed.d.voices.some((x) => x.id === publicId && x.featured === 1));
  });
  await check('heart is idempotent and bookmark persists', async () => {
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await request(`/api/voices/${publicId}`, {
            auth: true,
            method: 'PATCH',
            json: { action: 'heart', active: true },
          })
        ).r.status,
        200,
      );
    await request(`/api/voices/${publicId}`, {
      auth: true,
      method: 'PATCH',
      json: { action: 'save', active: true },
    });
    const { d } = await request('/api/me', { auth: true });
    assert.ok(d.saved.some((x) => x.id === publicId));
    const one = await request(`/api/voices/${publicId}`);
    assert.equal(one.d.voice.hearts, 1);
  });
  await check('duplicate reports produce one review item', async () => {
    for (let i = 0; i < 2; i++)
      await request(`/api/voices/${publicId}`, {
        auth: true,
        method: 'PATCH',
        json: { action: 'report', reason: 'QA 测试举报' },
      });
    const { d } = await request('/api/admin', { auth: true });
    assert.equal(d.reports.filter((x) => x.voice_id === publicId).length, 1);
  });
  const replyId = await create({ parentId: privateId });
  await check('future reply is independently linked', async () => {
    const { d } = await request(`/api/voices/${replyId}`, { auth: true });
    assert.equal(d.voice.parentId, privateId);
    assert.equal(d.voice.futureYear, 2036);
  });
  await check('export preserves original identity and audio links', async () => {
    const { d } = await request('/api/export', { auth: true });
    assert.equal(d.format, 'yidianguang-archive-v1');
    const v = d.voices.find((v) => v.id === privateId);
    assert.equal(v.signature, '当年的测试署名');
    assert.equal(v.recorded_at, '2020-10-12');
    assert.ok(v.audioUrl);
  });
  await check('rejection removes public access with review note', async () => {
    assert.equal(
      (
        await request('/api/admin', {
          auth: true,
          method: 'POST',
          json: { id: publicId, action: 'reject', note: '测试退回' },
        })
      ).r.status,
      200,
    );
    assert.equal((await request(`/api/voices/${publicId}/audio`)).r.status, 404);
    const { d } = await request(`/api/voices/${publicId}`, { auth: true });
    assert.equal(d.voice.reviewNote, '测试退回');
  });
  await check('owner can withdraw a public recording', async () => {
    await request('/api/admin', {
      auth: true,
      method: 'POST',
      json: { id: publicId, action: 'feature', note: '' },
    });
    assert.equal(
      (
        await request(`/api/voices/${publicId}`, {
          auth: true,
          method: 'PATCH',
          json: { action: 'hide' },
        })
      ).r.status,
      200,
    );
    assert.equal((await request(`/api/voices/${publicId}`)).r.status, 404);
  });
  await check('deleting original preserves reply as independent voice', async () => {
    await request(`/api/voices/${privateId}`, { auth: true, method: 'DELETE' });
    assert.equal((await request(`/api/voices/${privateId}`, { auth: true })).r.status, 404);
    const { d } = await request(`/api/voices/${replyId}`, { auth: true });
    assert.equal(d.voice.parentId, null);
  });
  console.log(`${checks} checks passed`);
} finally {
  for (const id of ids) await request(`/api/voices/${id}`, { auth: true, method: 'DELETE' });
  await request('/api/me', { auth: true, method: 'PATCH', json: { nickname: originalName } });
}
