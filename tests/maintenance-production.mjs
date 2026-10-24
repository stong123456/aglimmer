import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Miniflare } from 'miniflare';
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const root = path.resolve('dist/server'),
  names = (await fs.readdir(root, { recursive: true })).filter((p) => /\.m?js$/.test(p));
names.sort((a, b) => (a === 'index.js' ? -1 : b === 'index.js' ? 1 : a.localeCompare(b)));
const modules = await Promise.all(
  names.map(async (name) => ({
    type: 'ESModule',
    path: path.join(root, name),
    contents: await fs.readFile(path.join(root, name), 'utf8'),
  })),
);
const access = 'a'.repeat(64),
  secret = 'b'.repeat(64);
let cloudStatus = 206;
const mf = new Miniflare({
  modules,
  modulesRoot: root,
  compatibilityDate: '2026-05-15',
  compatibilityFlags: ['nodejs_compat'],
  cf: false,
  d1Databases: { DB: 'maintenance-isolated' },
  r2Buckets: ['BUCKET'],
  bindings: {
    MAINTENANCE_KEY_HASH: createHash('sha256').update(access).digest('hex'),
    BACKUP_ENCRYPTION_KEY: secret,
  },
  outboundService: async (req) => {
    const u = new URL(req.url);
    assert.ok(
      ['archive.org', 'www.youtube.com'].includes(u.hostname),
      'Only reviewed sources may be fetched',
    );
    if (u.hostname === 'www.youtube.com') return Response.json({ title: 'Official source' });
    return new Response(cloudStatus === 206 ? new Uint8Array([73, 68, 51, 1, 2, 3]) : null, {
      status: cloudStatus,
      headers: { 'Content-Type': 'audio/mpeg' },
    });
  },
});
const auth = { 'X-Glimmer-Maintenance': access, 'Content-Type': 'application/json' };
async function request(action, headers = auth) {
  const r = await mf.dispatchFetch('https://aglimmer.test/api/maintenance', {
    method: action ? 'POST' : 'GET',
    headers,
    ...(action ? { body: JSON.stringify({ action }) } : {}),
  });
  return { r, d: await r.json() };
}
try {
  const DB = await mf.getD1Database('DB'),
    BUCKET = await mf.getR2Bucket('BUCKET');
  for (const f of (await fs.readdir('drizzle')).filter((x) => x.endsWith('.sql')).sort())
    for (const sql of (await fs.readFile('drizzle/' + f, 'utf8'))
      .split('--> statement-breakpoint')
      .map((x) => x.trim())
      .filter(Boolean))
      await DB.prepare(sql).run();
  assert.equal((await request('backup', { 'Content-Type': 'application/json' })).r.status, 401);
  assert.equal(
    (
      await request('backup', {
        'Content-Type': 'application/json',
        'X-Glimmer-Maintenance': 'c'.repeat(64),
      })
    ).r.status,
    401,
  );
  assert.equal((await request('backup', { ...auth, Origin: 'https://evil.test' })).r.status, 403);
  await DB.prepare(
    "INSERT INTO profiles(id,nickname,created_at) VALUES('a','Private original name','2020-01-01')",
  ).run();
  await DB.prepare(
    "INSERT INTO voices(id,owner_id,title,signature,recorded_at,created_at,mood,transcript,duration,size,audio_key,mime,visibility,status) VALUES('one','a','Private title','Original signature','2020-01-02','2020-01-03','有点累','Private transcript',3,7,'audio/one','audio/mpeg','private','private')",
  ).run();
  await BUCKET.put('audio/one', new Uint8Array([1, 2, 3, 4, 5, 6, 7]));
  const large = Uint8Array.from({ length: 9 * 1024 * 1024 }, (_, i) => i % 251);
  await BUCKET.put('audio/large', large);
  await DB.prepare(
    "INSERT INTO voices(id,owner_id,title,signature,recorded_at,created_at,mood,transcript,duration,size,audio_key,mime,visibility,status) VALUES('large','a','Large private original','Original signature','2020-01-02','2020-01-03','有点累','',300,?,'audio/large','audio/mpeg','private','private')",
  )
    .bind(large.length)
    .run();
  let result;
  for (let n = 0; n < 5; n++) {
    result = await request('backup');
    assert.equal(result.r.status, 200);
    if (result.d.status === 'complete') break;
  }
  assert.equal(result.d.status, 'complete');
  assert.ok(!JSON.stringify(result.d).includes('Private'));
  assert.equal(
    (
      await DB.prepare('SELECT visibility,signature,recorded_at FROM voices WHERE id=?')
        .bind('one')
        .first()
    ).visibility,
    'private',
  );
  const backupObjects = await BUCKET.list({ prefix: '__backups__/' });
  assert.ok(backupObjects.objects.some((o) => o.key.includes('snapshots/')));
  for (const o of backupObjects.objects) {
    const bytes = new Uint8Array(await (await BUCKET.get(o.key)).arrayBuffer());
    assert.ok(!new TextDecoder().decode(bytes).includes('Private transcript'));
  }
  const before = (await DB.prepare('SELECT * FROM voices').all()).results;
  const drill = await request('drill');
  assert.equal(drill.r.status, 200);
  assert.equal(drill.d.sampleKind, 'original-object');
  assert.equal(drill.d.sampleBytes, 7);
  assert.deepEqual((await DB.prepare('SELECT * FROM voices').all()).results, before);
  assert.equal((await BUCKET.list({ prefix: '__backups__/drills/' })).objects.length, 0);
  // Authenticate/decrypt the actual generated snapshot, then restore its rows into a separate D1 database.
  const code = ts.transpileModule(await fs.readFile('lib/maintenance-crypto.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const core = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  const encrypted = backupObjects.objects.find((o) => o.key.includes('snapshots/'));
  const snap = JSON.parse(
    new TextDecoder().decode(
      await core.unseal(
        new Uint8Array(await (await BUCKET.get(encrypted.key)).arrayBuffer()),
        secret,
        encrypted.key,
      ),
    ),
  );
  const largeSnapshot = snap.objects.find((o) => o.key === 'audio/large');
  assert.equal(largeSnapshot.parts.length, 3);
  const merged = new Uint8Array(large.length);
  for (const part of largeSnapshot.parts) {
    const body = await BUCKET.get(part.key);
    const bytes = await core.unseal(new Uint8Array(await body.arrayBuffer()), secret, part.key);
    assert.equal(await core.sha256(bytes), part.sha256);
    merged.set(bytes, part.offset);
  }
  assert.deepEqual(merged, large);
  const projected = core.safeRestoreRows(snap.tables, []);
  const restored = new Miniflare({
    script: 'export default {fetch(){return new Response("ok")}}',
    modules: true,
    d1Databases: { RESTORE: 'restore-isolated' },
    cf: false,
  });
  try {
    const target = await restored.getD1Database('RESTORE');
    for (const f of (await fs.readdir('drizzle')).filter((x) => x.endsWith('.sql')).sort())
      for (const sql of (await fs.readFile('drizzle/' + f, 'utf8'))
        .split('--> statement-breakpoint')
        .map((x) => x.trim())
        .filter(Boolean))
        await target.prepare(sql).run();
    for (const table of core.BACKUP_TABLES)
      for (const row of projected[table]) {
        const fields = Object.keys(row);
        await target
          .prepare(
            `INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`,
          )
          .bind(...fields.map((k) => row[k]))
          .run();
      }
    const voice = await target.prepare('SELECT * FROM voices WHERE id=?').bind('one').first();
    assert.equal(voice.signature, 'Original signature');
    assert.equal(voice.recorded_at, '2020-01-02');
    assert.equal(voice.visibility, 'private');
  } finally {
    await restored.dispose();
  }
  console.log(
    'PASS encrypted daily snapshot, byte-identical sample restore, separate D1 restore and immutable originals',
  );
  let health = await request('sources');
  assert.equal(health.r.status, 200);
  assert.equal(health.d.checked, 12);
  assert.equal(health.d.available, 12);
  cloudStatus = 404;
  await DB.prepare(
    "UPDATE source_health SET next_check_at='2000-01-01',checked_at='2000-01-01' WHERE id='lv-zh-small-incident'",
  ).run();
  await request('sources');
  await request('sources');
  let source = await DB.prepare(
    "SELECT * FROM source_health WHERE id='lv-zh-small-incident'",
  ).first();
  assert.equal(source.failures, 1);
  assert.equal(
    (await (await mf.dispatchFetch('https://aglimmer.test/api/classics')).json()).hidden.includes(
      'lv-zh-small-incident',
    ),
    false,
  );
  await DB.prepare(
    "UPDATE source_health SET next_check_at='2000-01-01',checked_at='2000-01-01' WHERE id='lv-zh-small-incident'",
  ).run();
  await request('sources');
  assert.equal(
    (await (await mf.dispatchFetch('https://aglimmer.test/api/classics')).json()).hidden.includes(
      'lv-zh-small-incident',
    ),
    true,
  );
  cloudStatus = 403;
  await DB.prepare(
    "UPDATE source_health SET next_check_at='2000-01-01' WHERE id='lv-zh-small-incident'",
  ).run();
  await request('sources');
  assert.equal(
    (await (await mf.dispatchFetch('https://aglimmer.test/api/classics')).json()).hidden.includes(
      'lv-zh-small-incident',
    ),
    true,
  );
  cloudStatus = 206;
  await DB.prepare(
    "UPDATE source_health SET next_check_at='2000-01-01' WHERE id='lv-zh-small-incident'",
  ).run();
  await request('sources');
  assert.equal(
    (await (await mf.dispatchFetch('https://aglimmer.test/api/classics')).json()).hidden.includes(
      'lv-zh-small-incident',
    ),
    false,
  );
  console.log(
    'PASS bounded source checks, repeated 404 takedown, no false restoration on a regional 403, recovery on a successful source response',
  );
  const part = snap.objects[0].parts[0];
  await BUCKET.put(part.key, new Uint8Array([1, 2, 3]));
  await DB.prepare("DELETE FROM maintenance_runs WHERE kind='drill'").run();
  const corrupted = await request('drill');
  assert.equal(corrupted.r.status, 503);
  assert.equal(
    (await DB.prepare("SELECT status FROM maintenance_runs WHERE kind='drill'").first()).status,
    'failed',
  );
  assert.deepEqual((await DB.prepare('SELECT * FROM voices').all()).results, before);
  console.log(
    'PASS tampered backup fails restore verification without modifying live data; maintenance credentials and cross-origin requests fail closed',
  );
} finally {
  await mf.dispose();
}
