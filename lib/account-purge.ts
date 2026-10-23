import { db, bucket, HttpError } from './server';
import { identityHash } from './identity-hash';
// Only called for an explicit user request, after an administrator confirms
// deletion in Supabase. The persisted object list makes interrupted cleanup retryable.
export async function purgeRequestedAccount(userId: string, actorId: string) {
  if (userId === actorId) throw new HttpError(400, '请由另一位管理员处理你的注销申请。');
  const request = await db()
    .prepare('SELECT status,object_keys FROM account_closures WHERE user_id=?')
    .bind(userId)
    .first<{ status: string; object_keys: string }>();
  if (!request || !['requested', 'processing'].includes(request.status))
    throw new HttpError(409, '没有可处理的注销申请。');
  if (request.status === 'requested') {
    const claimed = await db()
      .prepare(
        "UPDATE account_closures SET status='processing',updated_at=? WHERE user_id=? AND status='requested'",
      )
      .bind(new Date().toISOString(), userId)
      .run();
    if (!claimed.meta.changes) throw new HttpError(409, '申请状态刚刚改变，请刷新。');
  }
  const [voiceKeys, messageKeys, profile, link] = await Promise.all([
    db()
      .prepare('SELECT audio_key FROM voices WHERE owner_id=?')
      .bind(userId)
      .all<{ audio_key: string }>(),
    db()
      .prepare('SELECT media_key FROM messages WHERE owner_id=? AND media_key IS NOT NULL')
      .bind(userId)
      .all<{ media_key: string }>(),
    db()
      .prepare('SELECT avatar_key FROM profiles WHERE id=?')
      .bind(userId)
      .first<{ avatar_key: string | null }>(),
    db()
      .prepare('SELECT subject FROM auth_identities WHERE user_id=?')
      .bind(userId)
      .first<{ subject: string }>(),
  ]);
  const keys = [
    ...new Set<string>([
      ...JSON.parse(request.object_keys),
      ...voiceKeys.results.map((x) => x.audio_key),
      ...messageKeys.results.map((x) => x.media_key),
      ...(profile?.avatar_key ? [profile.avatar_key] : []),
    ]),
  ];
  const now = new Date().toISOString();
  const statements = [
    db()
      .prepare('UPDATE account_closures SET object_keys=?,updated_at=? WHERE user_id=?')
      .bind(JSON.stringify(keys), now, userId),
  ];
  if (link)
    statements.push(
      db()
        .prepare('INSERT OR IGNORE INTO closed_identities(subject_hash,closed_at) VALUES(?,?)')
        .bind(await identityHash(link.subject), now),
    );
  // Reactions/reports belonging to other users are removed only when their target
  // content is being deleted. Independent replies by other authors are retained.
  for (const sql of [
    'UPDATE voices SET parent_id=NULL WHERE parent_id IN (SELECT id FROM voices WHERE owner_id=?)',
    'DELETE FROM reactions WHERE user_id=? OR voice_id IN (SELECT id FROM voices WHERE owner_id=?)',
    "DELETE FROM reports WHERE user_id=? OR voice_id IN (SELECT id FROM voices WHERE owner_id=?) OR voice_id IN (SELECT 'message:'||id FROM messages WHERE owner_id=?)",
    "DELETE FROM audit WHERE actor_id=? OR voice_id IN (SELECT id FROM voices WHERE owner_id=?) OR voice_id IN (SELECT 'message:'||id FROM messages WHERE owner_id=?)",
    'DELETE FROM voices WHERE owner_id=?',
    'DELETE FROM messages WHERE owner_id=?',
    'DELETE FROM auth_identities WHERE user_id=?',
    'DELETE FROM profiles WHERE id=?',
  ])
    statements.push(
      db()
        .prepare(sql)
        .bind(...Array.from({ length: (sql.match(/\?/g) ?? []).length }, () => userId)),
    );
  await db().batch(statements);
  for (let i = 0; i < keys.length; i += 100) await bucket().delete(keys.slice(i, i + 100));
  await db()
    .prepare(
      "UPDATE account_closures SET status='completed',object_keys='[]',updated_at=? WHERE user_id=?",
    )
    .bind(new Date().toISOString(), userId)
    .run();
  return { ok: true };
}
