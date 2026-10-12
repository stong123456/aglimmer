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
    return json({
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
