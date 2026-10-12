import { db, HttpError } from './server';
import { throttleHash } from './auth-core';
export async function authRateLimit(scope: string, value: string, limit: number, seconds: number) {
  const id = await throttleHash(scope, value),
    now = Date.now();
  const row = await db()
    .prepare(
      'INSERT INTO auth_throttle(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END WHERE expires_at<=? OR count<? RETURNING expires_at',
    )
    .bind(id, now + seconds * 1000, now, now, now + seconds * 1000, now, limit)
    .first<{ expires_at: number }>();
  if (!row) throw new HttpError(429, '请求太频繁，请稍后再试。');
  await db()
    .prepare('DELETE FROM auth_throttle WHERE expires_at<?')
    .bind(now - 86400000)
    .run();
}
