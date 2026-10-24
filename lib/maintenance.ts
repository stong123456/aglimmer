import { env } from 'cloudflare:workers';
import { db, bucket, HttpError } from './server';
import { CLASSIC_QUOTES, WITHDRAWN_CLASSIC_IDS } from './quotes';
import { sourceAudioUrl } from './listening';
import { QUIET_ZH_IDS } from './curation';
import {
  BACKUP_TABLES,
  seal,
  unseal,
  sha256,
  safeRestoreRows,
  type Tables,
  type Tombstone,
} from './maintenance-crypto';
const settings = () => env as unknown as Record<string, string | undefined>;
const PREFIX = '__backups__/',
  CHUNK = 4 * 1024 * 1024,
  CAP = 256 * 1024 * 1024,
  encoder = new TextEncoder();
type Part = { key: string; sha256: string; bytes: number; offset: number };
type Original = { key: string; size: number; parts: Part[] };
type Snapshot = {
  version: 1;
  createdAt: string;
  tables: Tables;
  objects: Original[];
  cursor: number;
  offset: number;
};
const secret = () => settings().BACKUP_ENCRYPTION_KEY ?? '';
const snapKey = (day: string) => PREFIX + 'snapshots/' + day + '.bin';
async function writeSnapshot(key: string, value: Snapshot) {
  const bytes = encoder.encode(JSON.stringify(value));
  if (bytes.length > 8 * 1024 * 1024) throw Error('Metadata backup exceeds the 8 MB safety limit');
  await bucket().put(key, await seal(bytes, secret(), key));
}
async function readSnapshot(key: string): Promise<Snapshot> {
  const r = await bucket().get(key);
  if (!r || r.size > 8 * 1024 * 1024 + 28) throw Error('Snapshot is missing or too large');
  return JSON.parse(
    new TextDecoder().decode(await unseal(new Uint8Array(await r.arrayBuffer()), secret(), key)),
  );
}
export async function maintenanceAuthorized(req: Request) {
  const digest = settings().MAINTENANCE_KEY_HASH,
    token = req.headers.get('x-glimmer-maintenance');
  if (!digest || !token || token.length !== 64 || digest.length !== 64) return false;
  const actual = await sha256(token);
  let different = 0;
  for (let i = 0; i < digest.length; i++) different |= actual.charCodeAt(i) ^ digest.charCodeAt(i);
  return different === 0;
}
async function claim(id: string, kind: string) {
  const now = new Date().toISOString(),
    stale = new Date(Date.now() - 5 * 60000).toISOString();
  const r = await db()
    .prepare(
      "INSERT INTO maintenance_runs(id,kind,status,created_at,updated_at,summary) VALUES(?,?,'busy',?,?,'{}') ON CONFLICT(id) DO UPDATE SET status='busy',updated_at=excluded.updated_at WHERE maintenance_runs.status IN ('running','failed') OR (maintenance_runs.status='busy' AND maintenance_runs.updated_at<?)",
    )
    .bind(id, kind, now, now, stale)
    .run();
  return !!r.meta.changes;
}
async function record(id: string, status: string, summary: unknown) {
  await db()
    .prepare('UPDATE maintenance_runs SET status=?,updated_at=?,summary=? WHERE id=?')
    .bind(status, new Date().toISOString(), JSON.stringify(summary), id)
    .run();
  return { id, status, ...(summary as object) };
}
async function deletions() {
  return (await db().prepare('SELECT key,kind,resource_id FROM backup_deletions').all<Tombstone>())
    .results;
}
export async function markDeleted(kind: string, id: string, key = '') {
  const now = new Date().toISOString();
  await db()
    .prepare(
      'INSERT OR REPLACE INTO backup_deletions(key,kind,resource_id,deleted_at) VALUES(?,?,?,?)',
    )
    .bind(key || kind + ':' + id, kind, id, now)
    .run();
}
export async function markDeletedObjects(userId: string, keys: string[]) {
  for (let i = 0; i < keys.length; i += 50)
    await db().batch(
      keys
        .slice(i, i + 50)
        .map((key) =>
          db()
            .prepare(
              'INSERT OR REPLACE INTO backup_deletions(key,kind,resource_id,deleted_at) VALUES(?,?,?,?)',
            )
            .bind(key, 'object', userId, new Date().toISOString()),
        ),
    );
}
async function list(prefix: string) {
  const result = await bucket().list({ prefix, limit: 1000 });
  if (result.truncated) throw Error('Backup index exceeded its bounded capacity');
  return result.objects;
}
async function prune() {
  const snapshots = await list(PREFIX + 'snapshots/'),
    keep = new Set<string>(),
    cutoff = Date.now() - 7 * 86400000;
  for (const obj of snapshots) {
    if (obj.uploaded.getTime() < cutoff) {
      await bucket().delete(obj.key);
      continue;
    }
    const snap = await readSnapshot(obj.key);
    for (const o of snap.objects) for (const p of o.parts) keep.add(p.key);
  }
  const blobs = await list(PREFIX + 'blobs/');
  const unused = blobs.filter((b) => !keep.has(b.key));
  for (let i = 0; i < unused.length; i += 100)
    await bucket().delete(unused.slice(i, i + 100).map((b) => b.key));
  await db()
    .prepare("DELETE FROM maintenance_runs WHERE created_at<? AND status<>'busy'")
    .bind(new Date(Date.now() - 90 * 86400000).toISOString())
    .run();
  await db()
    .prepare('DELETE FROM backup_deletions WHERE deleted_at<?')
    .bind(new Date(Date.now() - 30 * 86400000).toISOString())
    .run();
}
export async function backupStep() {
  if (!secret()) throw new HttpError(503, '备份加密尚未配置');
  const day = new Date().toISOString().slice(0, 10),
    id = 'backup:' + day,
    key = snapKey(day);
  if (!(await claim(id, 'backup')))
    return {
      id,
      status:
        (
          await db()
            .prepare('SELECT status FROM maintenance_runs WHERE id=?')
            .bind(id)
            .first<{ status: string }>()
        )?.status ?? 'busy',
    };
  try {
    let snap: Snapshot;
    if (!(await bucket().head(key))) {
      await prune();
      const rows = await db().batch(
        BACKUP_TABLES.map((t) => db().prepare(`SELECT * FROM ${t} LIMIT 10001`)),
      );
      const tables: Tables = {};
      for (let i = 0; i < BACKUP_TABLES.length; i++) {
        if (rows[i].results.length > 10000) throw Error('Database backup row safety limit reached');
        tables[BACKUP_TABLES[i]] = rows[i].results as Record<string, unknown>[];
      }
      const keys = [
        ...new Set(
          [
            ...(tables.voices ?? []).map((r) => r.audio_key),
            ...(tables.messages ?? []).map((r) => r.media_key),
            ...(tables.profiles ?? []).map((r) => r.avatar_key),
          ].filter((k): k is string => typeof k === 'string' && !!k),
        ),
      ];
      if (keys.some((k) => k.startsWith(PREFIX)))
        throw Error('An original unexpectedly points inside backup storage');
      if (keys.length > 1000) throw Error('Object inventory exceeded the bounded backup limit');
      snap = {
        version: 1,
        createdAt: new Date().toISOString(),
        tables,
        objects: keys.map((k) => ({ key: k, size: -1, parts: [] })),
        cursor: 0,
        offset: 0,
      };
      await writeSnapshot(key, snap);
      return record(id, 'running', { objects: keys.length, copiedParts: 0, bytes: 0 });
    }
    snap = await readSnapshot(key);
    const removed = await deletions();
    let work = 0;
    while (snap.cursor < snap.objects.length && work < 3) {
      const item = snap.objects[snap.cursor];
      if (removed.some((d) => d.key === item.key)) {
        snap.cursor++;
        snap.offset = 0;
        work++;
        continue;
      }
      const original = await bucket().head(item.key);
      if (!original) throw Error('An original object is missing; backup remains incomplete');
      if (item.size < 0) item.size = original.size;
      else if (item.size !== original.size) throw Error('An original changed during backup');
      if (snap.offset >= item.size) {
        snap.cursor++;
        snap.offset = 0;
        continue;
      }
      const part = await bucket().get(item.key, {
        range: { offset: snap.offset, length: Math.min(CHUNK, item.size - snap.offset) },
      });
      if (!part) throw Error('Original read failed');
      const bytes = new Uint8Array(await part.arrayBuffer()),
        hash = await sha256(bytes),
        blobKey = PREFIX + 'blobs/' + hash;
      if (bytes.length !== Math.min(CHUNK, item.size - snap.offset))
        throw Error('Original range was incomplete');
      if (!(await bucket().head(blobKey))) {
        const used = (await list(PREFIX + 'blobs/')).reduce((n, o) => n + o.size, 0);
        if (used + bytes.length + 28 > CAP)
          throw Error(
            'Backup capacity limit (256 MB) reached; an independent backup destination is required',
          );
        await bucket().put(blobKey, await seal(bytes, secret(), blobKey));
        const copied = await bucket().get(blobKey);
        if (
          !copied ||
          (await sha256(
            await unseal(new Uint8Array(await copied.arrayBuffer()), secret(), blobKey),
          )) !== hash
        )
          throw Error('Backup read-back verification failed');
      }
      item.parts.push({ key: blobKey, sha256: hash, bytes: bytes.length, offset: snap.offset });
      snap.offset += bytes.length;
      work++;
      if (snap.offset >= item.size) {
        snap.cursor++;
        snap.offset = 0;
      }
    }
    await writeSnapshot(key, snap);
    const all = snap.objects.flatMap((o) => o.parts),
      complete = snap.cursor >= snap.objects.length;
    return record(id, complete ? 'complete' : 'running', {
      objects: snap.objects.length,
      copiedObjects: snap.cursor,
      copiedParts: all.length,
      bytes: all.reduce((n, p) => n + p.bytes, 0),
      retentionDays: 7,
      independentCopy: false,
    });
  } catch (e) {
    await record(id, 'failed', { error: (e as Error).message.slice(0, 240) });
    throw e;
  }
}
function drillSummary(summary: Record<string, unknown>) {
  if (!summary.sampleKind) return summary;
  return {
    ...summary,
    scope:
      summary.sampleKind === 'original-object'
        ? 'Metadata projected with deletion ledger; one eligible original restored to private scratch storage. Live database not overwritten.'
        : 'Metadata decrypted and projected with deletion ledger; a canary checked private scratch storage. No user original was restored. Live database not overwritten.',
  };
}
export async function restoreDrill() {
  const date = new Date().toISOString().slice(0, 10),
    id = 'drill:' + date;
  if (!(await claim(id, 'drill'))) {
    const previous = await db()
      .prepare('SELECT status,summary FROM maintenance_runs WHERE id=?')
      .bind(id)
      .first<{ status: string; summary: string }>();
    return {
      id,
      status: previous?.status ?? 'busy',
      ...drillSummary(JSON.parse(previous?.summary ?? '{}')),
    };
  }
  try {
    const last = await db()
      .prepare(
        "SELECT id FROM maintenance_runs WHERE kind='backup' AND status='complete' ORDER BY created_at DESC LIMIT 1",
      )
      .first<{ id: string }>();
    if (!last) throw Error('No complete backup is available');
    const snap = await readSnapshot(snapKey(last.id.slice(7))),
      removed = await deletions(),
      restored = safeRestoreRows(snap.tables, removed);
    if (!BACKUP_TABLES.every((t) => Array.isArray(restored[t])))
      throw Error('Backup table format is invalid');
    const sample = snap.objects.find(
      (o) => o.size > 0 && o.size <= 8 * 1024 * 1024 && !removed.some((d) => d.key === o.key),
    );
    let original = new Uint8Array([65, 71, 76, 73, 77, 77, 69, 82]),
      kind = 'empty-or-large-only-canary',
      parts = 0;
    if (sample) {
      original = new Uint8Array(sample.size);
      let offset = 0;
      for (const p of sample.parts) {
        if (p.offset !== offset) throw Error('Backup chunks are out of order');
        const obj = await bucket().get(p.key);
        if (!obj) throw Error('A backup chunk is missing');
        const plain = await unseal(new Uint8Array(await obj.arrayBuffer()), secret(), p.key);
        if (plain.length !== p.bytes || (await sha256(plain)) !== p.sha256)
          throw Error('Backup chunk checksum mismatch');
        original.set(plain, offset);
        offset += plain.length;
        parts++;
      }
      if (offset !== sample.size) throw Error('Restored original is incomplete');
      kind = 'original-object';
    }
    const scratch = PREFIX + 'drills/' + crypto.randomUUID();
    try {
      await bucket().put(scratch, original);
      const check = await bucket().get(scratch);
      if (
        !check ||
        (await sha256(new Uint8Array(await check.arrayBuffer()))) !== (await sha256(original))
      )
        throw Error('Restored object read-back failed');
    } finally {
      await bucket().delete(scratch);
    }
    return record(
      id,
      'complete',
      drillSummary({
        backup: last.id,
        verifiedAt: new Date().toISOString(),
        metadataRows: Object.values(restored).reduce((n, r) => n + r.length, 0),
        sampleKind: kind,
        sampleParts: parts,
        sampleBytes: original.length,
        independentCopy: false,
      }),
    );
  } catch (e) {
    await record(id, 'failed', { error: (e as Error).message.slice(0, 240) });
    throw e;
  }
}
export async function scanSources() {
  const records = await db().prepare('SELECT * FROM source_health').all<{
      id: string;
      status: string;
      failures: number;
      checked_at: string;
      next_check_at: string;
    }>(),
    now = Date.now();
  const map = new Map(records.results.map((r) => [r.id, r]));
  const todo = CLASSIC_QUOTES.filter(
    (q) =>
      !WITHDRAWN_CLASSIC_IDS.includes(q.id) &&
      (!map.has(q.id) || Date.parse(map.get(q.id)!.next_check_at) <= now),
  )
    .sort((a, b) => {
      const x = map.get(a.id),
        y = map.get(b.id);
      const priority = (id: string, r: typeof x) =>
        r && r.failures > 0 ? 0 : QUIET_ZH_IDS.includes(id) ? 1 : !r ? 2 : 3;
      return (
        priority(a.id, x) - priority(b.id, y) ||
        (x?.checked_at ?? '').localeCompare(y?.checked_at ?? '')
      );
    })
    .slice(0, 12);
  const summary = { checked: 0, available: 0, unavailable: 0, uncertain: 0 };
  for (const q of todo) {
    let status = 'uncertain',
      http = 0,
      note = 'Network or regional access could not be confirmed';
    try {
      const url =
        q.media.provider === 'archive'
          ? sourceAudioUrl(q)
          : `https://www.youtube.com/oembed?url=${encodeURIComponent(q.sourceUrl)}&format=json`;
      const r = await fetch(url, {
        headers: q.media.provider === 'archive' ? { Range: 'bytes=0-1023' } : {},
        signal: AbortSignal.timeout(8000),
        redirect: 'follow',
      });
      http = r.status;
      if ([404, 410].includes(r.status)) {
        status = 'unavailable';
        note = 'Source returned ' + r.status;
        await r.body?.cancel();
      } else if (r.ok) {
        if (q.media.provider === 'archive') {
          const reader = r.body?.getReader(),
            chunk = await reader?.read();
          await reader?.cancel();
          const type = r.headers.get('content-type') ?? '';
          if (
            chunk?.value?.length &&
            /audio|octet-stream/i.test(type) &&
            ((chunk.value[0] === 73 && chunk.value[1] === 68 && chunk.value[2] === 51) ||
              chunk.value.some((v, i) => v === 255 && (chunk.value![i + 1] & 224) === 224))
          ) {
            status = 'available';
            note = 'Audio endpoint responded; not a complete listening review';
          }
        } else {
          const metadata = (await r.json()) as { title?: string };
          if (metadata.title) {
            status = 'available';
            note = 'Official embed metadata responded; playback remains region-dependent';
          }
        }
      } else await r.body?.cancel();
    } catch {}
    const previous = map.get(q.id),
      failures =
        status === 'unavailable'
          ? (previous?.failures ?? 0) + 1
          : status === 'available'
            ? 0
            : (previous?.failures ?? 0);
    // A timeout, rate limit or regional 403 never becomes an automatic takedown.
    const checkedAt = new Date().toISOString(),
      nextCheckAt = new Date(
        Date.now() +
          (status === 'available'
            ? QUIET_ZH_IDS.includes(q.id)
              ? 86400000
              : 7 * 86400000
            : 6 * 3600000),
      ).toISOString();
    await db()
      .prepare(
        'INSERT INTO source_health(id,status,failures,checked_at,next_check_at,note,http_status) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,failures=excluded.failures,checked_at=excluded.checked_at,next_check_at=excluded.next_check_at,note=excluded.note,http_status=excluded.http_status',
      )
      .bind(q.id, status, failures, checkedAt, nextCheckAt, note, http)
      .run();
    summary.checked++;
    summary[status as 'available' | 'unavailable' | 'uncertain']++;
  }
  return summary;
}
export async function maintenanceStatus() {
  const runs = await db()
    .prepare(
      'SELECT id,kind,status,updated_at,summary FROM maintenance_runs ORDER BY created_at DESC LIMIT 20',
    )
    .all();
  const health = await db()
    .prepare('SELECT status,COUNT(*) count FROM source_health GROUP BY status')
    .all();
  const issues = await db()
    .prepare(
      "SELECT id,status,note,checked_at,failures FROM source_health WHERE status<>'available' ORDER BY checked_at DESC LIMIT 30",
    )
    .all();
  return {
    runs: runs.results.map((r) => ({
      ...r,
      summary:
        r.kind === 'drill'
          ? drillSummary(JSON.parse(String(r.summary)))
          : JSON.parse(String(r.summary)),
    })),
    sources: health.results,
    limits: { backupBytes: CAP, retentionDays: 7, independentCopy: false },
    issues: issues.results,
    configured: !!settings().MAINTENANCE_KEY_HASH && !!secret(),
  };
}
