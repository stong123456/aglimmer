import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const base = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5173';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname))
  throw new Error('Local tests only');
const cookie = '__sites_local_auth=1',
  ids = [],
  voiceIds = [];
let checks = 0;
async function req(path, { auth = false, method = 'GET', body, json } = {}) {
  const headers = auth ? { cookie } : {};
  if (json) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  const r = await fetch(base + path, { method, body, headers });
  return { r, d: await r.clone().json() };
}
async function check(name, fn) {
  await fn();
  checks++;
  console.log('PASS', name);
}
function form(kind, body, image) {
  const f = new FormData();
  f.set('kind', kind);
  f.set('body', body);
  if (image) f.set('image', new Blob([image], { type: 'image/png' }), 'qa.png');
  return f;
}
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9v8AAAAASUVORK5CYII=',
  'base64',
);
try {
  await check('seven real channels including casual', async () => {
    const { d } = await req('/api/topics');
    assert.equal(d.topics.length, 7);
    assert.ok(d.topics.some((t) => t.id === 'casual'));
  });
  await check('anonymous posting denied', async () =>
    assert.equal(
      (await req('/api/channels/casual', { method: 'POST', body: form('text', 'QA') })).r.status,
      401,
    ),
  );
  await check('directed abuse and negative inducement blocked', async () => {
    for (const body of ['你就是废物', '活着没有意义，不如自杀'])
      assert.equal(
        (
          await req('/api/channels/casual', {
            auth: true,
            method: 'POST',
            body: form('text', body),
          })
        ).r.status,
        400,
      );
  });
  await check('fake image contents rejected', async () =>
    assert.equal(
      (
        await req('/api/channels/casual', {
          auth: true,
          method: 'POST',
          body: form('image', 'QA', new TextEncoder().encode('<html>bad</html>')),
        })
      ).r.status,
      400,
    ),
  );
  const text = await req('/api/channels/casual', {
    auth: true,
    method: 'POST',
    body: form('text', 'QA：今天有点累，但我想给自己做一顿饭。'),
  });
  assert.equal(text.r.status, 201, JSON.stringify(text.d));
  ids.push(text.d.id);
  const image = await req('/api/channels/casual', {
    auth: true,
    method: 'POST',
    body: form('image', 'QA 本地测试图片', png),
  });
  assert.equal(image.r.status, 201, JSON.stringify(image.d));
  ids.push(image.d.id);
  await check('pending messages visible only to author', async () => {
    const anon = await req('/api/channels/casual'),
      own = await req('/api/channels/casual', { auth: true });
    assert.ok(!anon.d.messages.some((m) => ids.includes(m.id)));
    assert.equal(own.d.messages.filter((m) => ids.includes(m.id)).length, 2);
    assert.ok(
      !(await req('/api/channels/infp', { auth: true })).d.messages.some((m) => ids.includes(m.id)),
    );
  });
  await check('pending image access authorized and bytes preserved', async () => {
    assert.equal((await req(`/api/messages/${image.d.id}/media`)).r.status, 404);
    const r = await fetch(base + `/api/messages/${image.d.id}/media`, { headers: { cookie } });
    assert.equal(r.status, 200);
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), png);
  });
  await check('moderation publishes text and image', async () => {
    for (const id of ids)
      assert.equal(
        (
          await req('/api/admin', {
            auth: true,
            method: 'POST',
            json: { kind: 'message', id, action: 'approve', note: 'QA' },
          })
        ).r.status,
        200,
      );
    const { d } = await req('/api/channels/casual');
    assert.equal(d.messages.filter((m) => ids.includes(m.id)).length, 2);
    assert.equal((await fetch(base + `/api/messages/${image.d.id}/media`)).status, 200);
  });
  await check('channel reports persist and deduplicate', async () => {
    for (let i = 0; i < 2; i++)
      await req(`/api/messages/${text.d.id}`, {
        auth: true,
        method: 'POST',
        json: { reason: 'QA 本地举报' },
      });
    const { d } = await req('/api/admin', { auth: true });
    assert.equal(d.reports.filter((r) => r.voice_id === 'message:' + text.d.id).length, 1);
  });
  const audio = await readFile(new URL('./fixtures/recorder-tone.webm', import.meta.url)),
    f = new FormData();
  Object.entries({
    title: 'QA 吹水声音',
    signature: 'QA 声音署名',
    recordedAt: '2026-10-12',
    mood: '需要勇气',
    transcript: '本地验证',
    source: '',
    visibility: 'public',
    duration: '3',
    futureYear: '',
    parentId: '',
    topic: 'casual',
  }).forEach(([k, v]) => f.set(k, v));
  f.set('audio', new Blob([audio], { type: 'audio/webm' }), 'qa.webm');
  const v = await req('/api/voices', { auth: true, method: 'POST', body: f });
  assert.equal(v.r.status, 201, JSON.stringify(v.d));
  voiceIds.push(v.d.id);
  await req('/api/admin', {
    auth: true,
    method: 'POST',
    json: { id: v.d.id, action: 'approve', note: 'QA' },
  });
  await check('voice text and image coexist with real channel counts', async () => {
    const { d } = await req('/api/channels/casual');
    assert.ok(d.messages.some((m) => m.id === v.d.id && m.kind === 'voice'));
    const topics = await req('/api/topics');
    assert.equal(topics.d.topics.find((t) => t.id === 'casual').count, 3);
  });
  await check('rejected image immediately stops public access', async () => {
    await req('/api/admin', {
      auth: true,
      method: 'POST',
      json: { id: image.d.id, kind: 'message', action: 'reject', note: 'QA 退回' },
    });
    assert.equal((await fetch(base + `/api/messages/${image.d.id}/media`)).status, 404);
    assert.ok(!(await req('/api/channels/casual')).d.messages.some((m) => m.id === image.d.id));
  });
  await check('archive export includes original channel messages and images', async () => {
    const { d } = await req('/api/export', { auth: true });
    assert.equal(d.messages.filter((m) => ids.includes(m.id)).length, 2);
    assert.ok(d.messages.find((m) => m.id === image.d.id).mediaUrl);
    assert.equal(d.voices.find((x) => x.id === v.d.id).topic, 'casual');
  });
  console.log(`${checks} channel checks passed`);
} finally {
  for (const id of ids) await req(`/api/messages/${id}`, { auth: true, method: 'DELETE' });
  for (const id of voiceIds) await req(`/api/voices/${id}`, { auth: true, method: 'DELETE' });
}
