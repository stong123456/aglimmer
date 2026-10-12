import { cookies } from 'next/headers';
import { authConfig } from '@/lib/auth-server';
import { assertOrigin, json, fail, HttpError } from '@/lib/server';
export async function POST(req: Request) {
  try {
    assertOrigin(req);
    if (
      process.env.NODE_ENV !== 'development' ||
      authConfig().ready ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(req.url).hostname)
    )
      throw new HttpError(404, '接口不存在');
    const store = await cookies();
    store.set('__sites_local_auth', '1', {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: 86400,
    });
    return json({ ok: true, local: true });
  } catch (e) {
    return fail(e);
  }
}
