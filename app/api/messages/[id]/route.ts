import {
  db,
  bucket,
  identity,
  json,
  fail,
  HttpError,
  assertOrigin,
  readBody,
  text,
} from '@/lib/server';
export async function DELETE(req: Request, c: { params: Promise<{ id: string }> }) {
  try {
    assertOrigin(req);
    const u = (await identity(true))!;
    const { id } = await c.params;
    const r = await db()
      .prepare('SELECT owner_id,media_key FROM messages WHERE id=?')
      .bind(id)
      .first();
    if (!r) throw new HttpError(404, '消息不存在');
    if (r.owner_id !== u.userId) throw new HttpError(403, '只能删除自己的消息');
    await db().batch([
      db().prepare('DELETE FROM messages WHERE id=?').bind(id),
      db().prepare('DELETE FROM reports WHERE voice_id=?').bind(`message:${id}`),
    ]);
    if (r.media_key) await bucket().delete(String(r.media_key));
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request, c: { params: Promise<{ id: string }> }) {
  try {
    assertOrigin(req);
    const u = (await identity(true))!;
    const { id } = await c.params;
    const b = await readBody(req),
      reason = text(b.reason, 300, '举报原因', true);
    const r = await db()
      .prepare("SELECT id FROM messages WHERE id=? AND status='approved'")
      .bind(id)
      .first();
    if (!r) throw new HttpError(404, '消息不存在');
    const marker = `message:${id}`;
    const old = await db()
      .prepare('SELECT id FROM reports WHERE user_id=? AND voice_id=? AND resolved=0')
      .bind(u.userId, marker)
      .first();
    if (!old)
      await db()
        .prepare('INSERT INTO reports(id,user_id,voice_id,reason,created_at) VALUES(?,?,?,?,?)')
        .bind(crypto.randomUUID(), u.userId, marker, reason, new Date().toISOString())
        .run();
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
