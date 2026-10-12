import { cookies } from 'next/headers';
import { authClient } from '@/lib/auth-server';
import { assertOrigin, json, fail } from '@/lib/server';
export async function POST(req: Request) {
  try {
    assertOrigin(req);
    const client = await authClient();
    if (client) await client.auth.signOut({ scope: 'local' });
    const store = await cookies();
    for (const c of store.getAll())
      if (c.name.startsWith('sb-'))
        store.set(c.name, '', {
          path: '/',
          maxAge: 0,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
        });
    store.set('__sites_local_auth', '', { path: '/', maxAge: 0, httpOnly: true, sameSite: 'lax' });
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
