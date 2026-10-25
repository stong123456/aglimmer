import { assertOrigin, db, fail, HttpError, json, readBody, text } from '@/lib/server';
import { authRateLimit } from '@/lib/auth-throttle';
import { throttleHash } from '@/lib/auth-core';
import { sourceRecord } from '@/lib/source-registry';
export async function POST(req: Request) {
  try {
    assertOrigin(req);
    if (Number(req.headers.get('content-length') ?? 0) > 2048)
      throw new HttpError(413, '反馈不能超过 300 字');
    const body = await readBody(req);
    if (!sourceRecord(String(body.id))) throw new HttpError(404, '没有找到这条经典素材');
    const reason = text(body.reason, 300, '反馈', true);
    if (reason.length < 10) throw new HttpError(400, '请至少填写 10 字，方便审核员核对。');
    const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
    await authRateLimit('classics-notice', ip, 10, 3600);
    const actor = 'notice:' + (await throttleHash('classics-notice-actor', ip));
    const target = 'quote:' + String(body.id);
    const existing = await db()
      .prepare('SELECT id FROM reports WHERE user_id=? AND voice_id=? AND resolved=0')
      .bind(actor, target)
      .first();
    if (existing) return json({ ok: true, duplicate: true });
    await db()
      .prepare('INSERT INTO reports(id,user_id,voice_id,reason,created_at) VALUES(?,?,?,?,?)')
      .bind(crypto.randomUUID(), actor, target, reason, new Date().toISOString())
      .run();
    return json({ ok: true }, 201);
  } catch (e) {
    return fail(e);
  }
}
