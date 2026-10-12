import { readBody } from '@/lib/server';
import {
  db,
  identity,
  isAdmin,
  json,
  fail,
  assertOrigin,
  HttpError,
  SELECT,
  toVoice,
  text,
} from '@/lib/server';
async function admin() {
  const u = (await identity(true))!;
  if (!isAdmin(u.userId)) throw new HttpError(403, '需要审核员权限');
  return u;
}
export async function GET() {
  try {
    await admin();
    const [rows, reports, messages] = await Promise.all([
      db()
        .prepare(
          `${SELECT} WHERE v.visibility='public' ORDER BY CASE WHEN v.status='pending' THEN 0 ELSE 1 END,v.created_at DESC LIMIT 100`,
        )
        .all(),
      db()
        .prepare(
          "SELECT r.*,COALESCE(v.title,m.body,'频道图片') title FROM reports r LEFT JOIN voices v ON v.id=r.voice_id LEFT JOIN messages m ON r.voice_id='message:'||m.id WHERE r.resolved=0 ORDER BY r.created_at DESC LIMIT 100",
        )
        .all(),
      db()
        .prepare(
          "SELECT * FROM messages ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,created_at DESC LIMIT 100",
        )
        .all(),
    ]);
    return json({
      voices: rows.results.map((r) => toVoice(r)),
      reports: reports.results,
      messages: messages.results,
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  try {
    assertOrigin(req);
    const u = await admin();
    const body = await readBody(req);
    if (body.action === 'resolve') {
      await db().prepare('UPDATE reports SET resolved=1 WHERE id=?').bind(String(body.id)).run();
      return json({ ok: true });
    }
    const id = text(body.id, 80, '声音 ID', true),
      note = text(body.note ?? '', 300, '审核说明');
    const actions = ['approve', 'feature', 'unfeature', 'reject'];
    if (!actions.includes(String(body.action))) throw new HttpError(400, '无效审核操作');
    if (body.action === 'reject' && !note) throw new HttpError(400, '请填写退回原因');
    if (body.kind === 'message') {
      if (!['approve', 'reject'].includes(String(body.action)))
        throw new HttpError(400, '无效消息审核操作');
      const m = await db().prepare('SELECT id FROM messages WHERE id=?').bind(id).first();
      if (!m) throw new HttpError(404, '消息不存在');
      const now = new Date().toISOString();
      await db().batch([
        db()
          .prepare(
            'UPDATE messages SET status=?,review_note=?,reviewed_at=?,reviewed_by=? WHERE id=?',
          )
          .bind(body.action === 'reject' ? 'rejected' : 'approved', note, now, u.userId, id),
        db()
          .prepare(
            'INSERT INTO audit(id,actor_id,voice_id,action,note,created_at) VALUES(?,?,?,?,?,?)',
          )
          .bind(crypto.randomUUID(), u.userId, `message:${id}`, body.action, note, now),
      ]);
      return json({ ok: true });
    }
    const row = await db()
      .prepare("SELECT id FROM voices WHERE id=? AND visibility='public'")
      .bind(id)
      .first();
    if (!row) throw new HttpError(404, '没有找到待审核声音');
    const status = body.action === 'reject' ? 'rejected' : 'approved',
      featured = body.action === 'feature' ? 1 : 0;
    const now = new Date().toISOString();
    await db().batch([
      db()
        .prepare(
          'UPDATE voices SET status=?,featured=?,review_note=?,reviewed_at=?,reviewed_by=? WHERE id=?',
        )
        .bind(status, featured, note, now, u.userId, id),
      db()
        .prepare(
          'INSERT INTO audit(id,actor_id,voice_id,action,note,created_at) VALUES(?,?,?,?,?,?)',
        )
        .bind(crypto.randomUUID(), u.userId, id, body.action, note, now),
    ]);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
