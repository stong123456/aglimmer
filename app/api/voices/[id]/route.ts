import { markDeleted } from '@/lib/maintenance';
import { readBody } from '@/lib/server';
import {
  db,
  bucket,
  identity,
  isAdmin,
  json,
  fail,
  assertOrigin,
  HttpError,
  findVoice,
  toVoice,
} from '@/lib/server';
import { DEMOS } from '@/lib/shared';
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, c: Context) {
  try {
    const { id } = await c.params;
    const u = await identity();
    const v = await findVoice(id, u?.userId, u ? isAdmin(u.userId) : false);
    if (!v) throw new HttpError(404, '没有找到这段声音');
    if (id.startsWith('demo-')) return json({ voice: v });
    const reacts = u
      ? await db()
          .prepare('SELECT kind FROM reactions WHERE user_id=? AND voice_id=?')
          .bind(u.userId, id)
          .all<{ kind: string }>()
      : { results: [] };
    return json({
      voice: toVoice(
        v as Record<string, unknown>,
        reacts.results.some((x) => x.kind === 'save'),
        reacts.results.some((x) => x.kind === 'heart'),
      ),
    });
  } catch (e) {
    return fail(e);
  }
}
export async function PATCH(req: Request, c: Context) {
  try {
    assertOrigin(req);
    const u = (await identity(true))!;
    const { id } = await c.params;
    const body = await readBody(req);
    if (DEMOS.some((v) => v.id === id))
      throw new HttpError(400, '示例录音仅用于体验，互动不会写入真实档案');
    await findVoice(id, u.userId);
    const v = await db()
      .prepare('SELECT visibility,status,owner_id FROM voices WHERE id=?')
      .bind(id)
      .first<{ visibility: string; status: string; owner_id: string }>();
    if (!v) throw new HttpError(404, '声音不存在');
    if (body.action === 'report') {
      if (v.visibility !== 'public' || v.status !== 'approved')
        throw new HttpError(403, '只能举报已公开的声音');
      const reason = String(body.reason ?? '').trim();
      if (!reason || reason.length > 300) throw new HttpError(400, '请填写 1–300 字举报原因');
      const recent = await db()
        .prepare('SELECT id FROM reports WHERE user_id=? AND voice_id=? AND resolved=0')
        .bind(u.userId, id)
        .first();
      if (!recent)
        await db()
          .prepare('INSERT INTO reports(id,user_id,voice_id,reason,created_at) VALUES(?,?,?,?,?)')
          .bind(crypto.randomUUID(), u.userId, id, reason, new Date().toISOString())
          .run();
      return json({ ok: true });
    }
    if (body.action === 'hide') {
      if (v.owner_id !== u.userId) throw new HttpError(403, '只能修改自己的声音');
      await db()
        .prepare("UPDATE voices SET visibility='private',status='private',featured=0 WHERE id=?")
        .bind(id)
        .run();
      return json({ ok: true });
    }
    if (body.action === 'publish') {
      if (v.owner_id !== u.userId) throw new HttpError(403, '只能修改自己的声音');
      if (v.visibility === 'public') return json({ ok: true, status: v.status });
      const since = new Date(Date.now() - 3600000).toISOString();
      const recent = await db()
        .prepare(
          "SELECT COUNT(*) n FROM audit WHERE actor_id=? AND action='request_publication' AND created_at>?",
        )
        .bind(u.userId, since)
        .first<{ n: number }>();
      if ((recent?.n ?? 0) >= 10) throw new HttpError(429, '每小时最多申请公开 10 段声音');
      const now = new Date().toISOString();
      await db().batch([
        db()
          .prepare(
            "UPDATE voices SET visibility='public',status='pending',featured=0,review_note='',reviewed_at=NULL,reviewed_by=NULL WHERE id=? AND owner_id=? AND visibility='private'",
          )
          .bind(id, u.userId),
        db()
          .prepare(
            "INSERT INTO audit(id,actor_id,voice_id,action,note,created_at) VALUES(?,?,?,'request_publication','',?)",
          )
          .bind(crypto.randomUUID(), u.userId, id, now),
      ]);
      return json({ ok: true, status: 'pending' });
    }
    if (!['heart', 'save'].includes(String(body.action)) || typeof body.active !== 'boolean')
      throw new HttpError(400, '无效操作');
    if (v.visibility !== 'public' || v.status !== 'approved')
      throw new HttpError(403, '这段声音尚未公开');
    if (body.active)
      await db()
        .prepare(
          'INSERT OR IGNORE INTO reactions(user_id,voice_id,kind,created_at) VALUES(?,?,?,?)',
        )
        .bind(u.userId, id, body.action, new Date().toISOString())
        .run();
    else
      await db()
        .prepare('DELETE FROM reactions WHERE user_id=? AND voice_id=? AND kind=?')
        .bind(u.userId, id, body.action)
        .run();
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
export async function DELETE(req: Request, c: Context) {
  try {
    assertOrigin(req);
    const u = (await identity(true))!;
    const { id } = await c.params;
    const v = await db()
      .prepare('SELECT owner_id,audio_key FROM voices WHERE id=?')
      .bind(id)
      .first<{ owner_id: string; audio_key: string }>();
    if (!v) throw new HttpError(404, '声音不存在');
    if (v.owner_id !== u.userId) throw new HttpError(403, '只能删除自己的声音');
    await markDeleted('voice', id, v.audio_key);
    await db().batch([
      db().prepare('UPDATE voices SET parent_id=NULL WHERE parent_id=?').bind(id),
      db().prepare('DELETE FROM reactions WHERE voice_id=?').bind(id),
      db().prepare('DELETE FROM reports WHERE voice_id=?').bind(id),
      db().prepare('DELETE FROM voices WHERE id=?').bind(id),
    ]);
    await bucket().delete(v.audio_key);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
