import {
  db,
  identity,
  isAdmin,
  json,
  fail,
  assertOrigin,
  readBody,
  text,
  HttpError,
} from '@/lib/server';
import { purgeRequestedAccount } from '@/lib/account-purge';
async function administrator() {
  const u = (await identity(true))!;
  if (!isAdmin(u.userId)) throw new HttpError(403, '需要审核员权限');
  return u;
}
export async function GET() {
  try {
    await administrator();
    const rows = await db()
      .prepare(
        `SELECT c.user_id,c.status,c.requested_at,c.updated_at,p.nickname,a.subject
      FROM account_closures c LEFT JOIN profiles p ON c.user_id=p.id
      LEFT JOIN auth_identities a ON c.user_id=a.user_id WHERE c.status IN ('requested','processing')
      ORDER BY c.requested_at,c.user_id LIMIT 100`,
      )
      .all();
    return json({
      requests: rows.results.map(({ subject, ...r }) => ({
        ...r,
        providerUserId:
          typeof subject === 'string' && subject.startsWith('supabase:') ? subject.slice(9) : null,
      })),
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  try {
    assertOrigin(req);
    const admin = await administrator();
    const body = await readBody(req);
    if (body.providerRemoved !== true || body.confirmation !== 'DELETE')
      throw new HttpError(400, '请先在 Supabase 删除对应身份，再填写 DELETE 确认。');
    return json(await purgeRequestedAccount(text(body.userId, 80, '账户编号', true), admin.userId));
  } catch (e) {
    return fail(e);
  }
}
