import { readBody } from '@/lib/server';
import { adminQuery, pageInfo } from '@/lib/admin-query';
import { hiddenClassics } from '@/lib/classic-visibility';
import { sourceRecord } from '@/lib/source-registry';
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
export async function GET(req: Request) {
  try {
    await admin();
    let q;
    try {
      q = adminQuery(req.url);
    } catch {
      throw new HttpError(400, '无效的审核筛选或页码');
    }
    const voiceWhere = "v.visibility='public'" + (q.status === 'all' ? '' : ' AND v.status=?');
    const messageWhere = q.status === 'all' ? '1=1' : 'status=?';
    const args = q.status === 'all' ? [] : [q.status];
    const order = "CASE WHEN status='pending' THEN 0 ELSE 1 END,created_at DESC,id DESC";
    const [rows, reports, messages] = await Promise.all([
      db()
        .prepare(
          `${SELECT} WHERE ${voiceWhere} ORDER BY CASE WHEN v.status='pending' THEN 0 ELSE 1 END,v.created_at DESC,v.id DESC LIMIT ? OFFSET ?`,
        )
        .bind(...args, q.limit, q.voices * q.limit)
        .all(),
      db()
        .prepare(
          "SELECT r.*,COALESCE(v.title,m.body,'内容已撤回或不可用') title FROM reports r LEFT JOIN voices v ON v.id=r.voice_id AND v.visibility='public' LEFT JOIN messages m ON r.voice_id='message:'||m.id WHERE r.resolved=0 ORDER BY r.created_at DESC,r.id DESC LIMIT ? OFFSET ?",
        )
        .bind(q.limit, q.reports * q.limit)
        .all(),
      db()
        .prepare(`SELECT * FROM messages WHERE ${messageWhere} ORDER BY ${order} LIMIT ? OFFSET ?`)
        .bind(...args, q.limit, q.messages * q.limit)
        .all(),
    ]);
    const [voiceCount, messageCount, reportCount, pendingVoices, pendingMessages] =
      await Promise.all([
        db()
          .prepare(`SELECT COUNT(*) n FROM voices v WHERE ${voiceWhere}`)
          .bind(...args)
          .first<{ n: number }>(),
        db()
          .prepare(`SELECT COUNT(*) n FROM messages WHERE ${messageWhere}`)
          .bind(...args)
          .first<{ n: number }>(),
        db().prepare('SELECT COUNT(*) n FROM reports WHERE resolved=0').first<{ n: number }>(),
        db()
          .prepare("SELECT COUNT(*) n FROM voices WHERE visibility='public' AND status='pending'")
          .first<{ n: number }>(),
        db()
          .prepare("SELECT COUNT(*) n FROM messages WHERE status='pending'")
          .first<{ n: number }>(),
      ]);
    const classicHidden = await hiddenClassics();
    return json({
      voices: rows.results.map((r) => toVoice(r)),
      reports: reports.results.map((r) => {
        const quote = sourceRecord(String(r.voice_id).replace(/^quote:/, ''));
        return quote
          ? {
              ...r,
              classicHidden: classicHidden.includes(quote.id),
              title: `内容来源 · ${quote.credit} · ${quote.title}`,
            }
          : r;
      }),
      messages: messages.results,
      pagination: {
        voices: pageInfo(q.voices, voiceCount?.n ?? 0, q.limit),
        messages: pageInfo(q.messages, messageCount?.n ?? 0, q.limit),
        reports: pageInfo(q.reports, reportCount?.n ?? 0, q.limit),
      },
      pending: { voices: pendingVoices?.n ?? 0, messages: pendingMessages?.n ?? 0 },
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
    if (['hide_classic', 'restore_classic'].includes(String(body.action))) {
      const quote = sourceRecord(String(body.id));
      if (!quote) throw new HttpError(404, '没有找到这条经典素材');
      if (body.action === 'restore_classic' && quote.retired)
        throw new HttpError(409, '这批录音已因听感反馈撤下，请先更换音源。');
      await db()
        .prepare(
          'INSERT INTO audit(id,actor_id,voice_id,action,note,created_at) VALUES(?,?,?,?,?,?)',
        )
        .bind(
          crypto.randomUUID(),
          u.userId,
          'quote:' + quote.id,
          String(body.action),
          '版权或出处核对',
          new Date().toISOString(),
        )
        .run();
      if (body.action === 'restore_classic')
        await db()
          .prepare(
            "UPDATE source_health SET status='uncertain',failures=0,next_check_at=?,note='Manually restored; next source check pending' WHERE id=?",
          )
          .bind(new Date().toISOString(), quote.id)
          .run();
      return json({ ok: true });
    }
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
