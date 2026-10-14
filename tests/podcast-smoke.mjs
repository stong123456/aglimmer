import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5173';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname))
  throw Error('Local tests only');
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

const ids = [];
async function request(path, options = {}) {
  return fetch(base + path, {
    ...options,
    headers: { cookie: '__sites_local_auth=1', ...(options.headers || {}) },
  });
}
function form(seconds, topic = 'podcast') {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    title: 'QA 播客边界测试',
    signature: '测试',
    recordedAt: '2026-10-13',
    mood: '有点累',
    visibility: 'public',
    topic,
    transcript:
      topic === 'podcast'
        ? '[00:00] 故事开场\n[02:30] 一盏小灯\n' + '这是原创的温柔睡前故事。'.repeat(400)
        : '测试数据',
    source: '原创测试',
  }))
    f.set(k, v);
  f.set('audio', new Blob([wav(seconds)], { type: 'audio/wav' }), 'test.wav');
  f.set('duration', '2');
  return f;
}
try {
  let r = await request('/api/voices', { method: 'POST', body: form(360) });
  let d = await r.json();
  assert.equal(r.status, 201, JSON.stringify(d));
  ids.push(d.id);

  assert.equal((await request('/api/voices?topic=podcast&mode=all')).status, 200);
  let listing = await (await request('/api/voices?topic=podcast&mode=all')).json();
  assert.ok(!listing.voices.some((v) => v.id === d.id), 'Pending podcast must not be public');
  r = await request('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: d.id, action: 'approve' }),
  });
  assert.equal(r.status, 200);
  listing = await (await request('/api/voices?topic=podcast&mode=all')).json();
  assert.ok(
    listing.voices.some((v) => v.id === d.id && v.duration === 360 && v.transcript.length > 3000),
  );
  listing = await (await request('/api/voices?mode=all')).json();
  assert.ok(!listing.voices.some((v) => v.id === d.id), 'Podcast must not enter short wall');
  assert.equal((await request('/api/voices', { method: 'POST', body: form(30) })).status, 400);
  assert.equal((await request('/api/voices', { method: 'POST', body: form(92, '') })).status, 400);
  console.log(
    'PASS podcast real measured duration, pending privacy, approval, separate wall and minimum/short maximum limits',
  );
} finally {
  for (const id of ids) await request('/api/voices/' + id, { method: 'DELETE' });
}
