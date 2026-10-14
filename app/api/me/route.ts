import { readBody } from '@/lib/server';
import {
  identity,
  db,
  ensureProfile,
  json,
  fail,
  assertOrigin,
  text,
  isAdmin,
  SELECT,
  toVoice,
} from '@/lib/server';
export async function GET() {
  try {
    const u = await identity();
    if (!u) return json({ user: null });
    await ensureProfile(u.userId);
    const p = await db()
      .prepare('SELECT nickname,avatar_key FROM profiles WHERE id=?')
      .bind(u.userId)
      .first<{ nickname: string; avatar_key: string | null }>();
    const [own, saved] = await Promise.all([
      db().prepare(`${SELECT} WHERE v.owner_id=? ORDER BY v.created_at DESC`).bind(u.userId).all(),
      db()
        .prepare(
          `${SELECT} JOIN reactions r ON r.voice_id=v.id AND r.user_id=? AND r.kind='save' WHERE v.visibility='public' AND v.status='approved' ORDER BY r.created_at DESC`,
        )
        .bind(u.userId)
        .all(),
    ]);
    return json({
      user: {
        nickname: p?.nickname,
        avatarUrl: p?.avatar_key ? '/api/me/avatar?v=' + p.avatar_key.split('/').at(-1) : null,
        userId: u.userId,
        email: u.email,
        provider: u.provider,
        admin: isAdmin(u.userId),
      },
      voices: own.results.map((r) => toVoice(r)),
      saved: saved.results.map((r) => toVoice(r, true)),
    });
  } catch (e) {
    return fail(e);
  }
}
export async function PATCH(req: Request) {
  try {
    assertOrigin(req);
    const u = (await identity(true))!;
    const body = await readBody(req);
    const nickname = text(body.nickname, 24, '署名', true);
    await ensureProfile(u.userId);
    await db().prepare('UPDATE profiles SET nickname=? WHERE id=?').bind(nickname, u.userId).run();
    return json({ nickname });
  } catch (e) {
    return fail(e);
  }
}
