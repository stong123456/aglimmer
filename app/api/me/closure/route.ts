import { db, identity, json, fail, assertOrigin, readBody, HttpError } from '@/lib/server';
export async function GET() {
  try {
    const u = (await identity(true))!;
    const request = await db()
      .prepare('SELECT status,requested_at,updated_at FROM account_closures WHERE user_id=?')
      .bind(u.userId)
      .first();
    return json({ request });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  try {
    assertOrigin(req);
    const u = (await identity(true))!;
    const body = await readBody(req);
    if (body.confirmation !== 'CLOSE') throw new HttpError(400, '请填写 CLOSE 确认注销申请。');
    const now = new Date().toISOString();
    const result = await db()
      .prepare(
        `INSERT INTO account_closures(user_id,status,requested_at,updated_at)
      VALUES(?,'requested',?,?) ON CONFLICT(user_id) DO UPDATE SET status='requested',requested_at=excluded.requested_at,updated_at=excluded.updated_at
      WHERE account_closures.status='cancelled'`,
      )
      .bind(u.userId, now, now)
      .run();
    return json({ ok: true, created: result.meta.changes > 0 });
  } catch (e) {
    return fail(e);
  }
}
export async function DELETE(req: Request) {
  try {
    assertOrigin(req);
    const u = (await identity(true))!;
    const result = await db()
      .prepare(
        "UPDATE account_closures SET status='cancelled',updated_at=? WHERE user_id=? AND status='requested'",
      )
      .bind(new Date().toISOString(), u.userId)
      .run();
    if (!result.meta.changes) throw new HttpError(409, '申请已进入处理，无法撤回。');
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
