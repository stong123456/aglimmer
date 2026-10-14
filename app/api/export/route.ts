import { db, identity, json, fail } from '@/lib/server';
export async function GET() {
  try {
    const u = (await identity(true))!;
    const rows = await db()
      .prepare(
        'SELECT id,title,signature,recorded_at,created_at,mood,topic,transcript,source,duration,mime,size,visibility,status,future_year,parent_id FROM voices WHERE owner_id=? ORDER BY created_at',
      )
      .bind(u.userId)
      .all();
    const messages = await db()
      .prepare(
        'SELECT id,topic,kind,body,signature,created_at,status,mime,size,review_note FROM messages WHERE owner_id=? ORDER BY created_at',
      )
      .bind(u.userId)
      .all();
    const profile = await db()
      .prepare('SELECT id,nickname,created_at,avatar_key,avatar_mime FROM profiles WHERE id=?')
      .bind(u.userId)
      .first<{
        id: string;
        nickname: string;
        created_at: string;
        avatar_key: string | null;
        avatar_mime: string | null;
      }>();
    return json({
      profile: profile
        ? {
            id: profile.id,
            nickname: profile.nickname,
            createdAt: profile.created_at,
            avatarMime: profile.avatar_mime,
            avatarUrl: profile.avatar_key ? '/api/me/avatar' : null,
          }
        : null,
      messages: messages.results.map((m) => ({
        ...m,
        ...(m.kind === 'image' ? { mediaUrl: `/api/messages/${m.id}/media` } : {}),
      })),
      format: 'yidianguang-archive-v1',
      exportedAt: new Date().toISOString(),
      timezone: 'Asia/Shanghai',
      voices: rows.results.map((v) => ({ ...v, audioUrl: `/api/voices/${v.id}/audio` })),
    });
  } catch (e) {
    return fail(e);
  }
}
