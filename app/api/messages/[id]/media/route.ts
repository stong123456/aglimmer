import { db, bucket, identity, isAdmin, fail, HttpError } from '@/lib/server';
export async function GET(req: Request, c: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await c.params;
    const u = await identity();
    const r = await db()
      .prepare("SELECT * FROM messages WHERE id=? AND kind='image'")
      .bind(id)
      .first();
    if (!r || !(r.status === 'approved' || r.owner_id === u?.userId || (u && isAdmin(u.userId))))
      throw new HttpError(404, '图片不存在');
    const obj = await bucket().get(String(r.media_key));
    if (!obj) throw new HttpError(404, '图片不存在');
    return new Response(obj.body, {
      headers: {
        'Content-Type': String(r.mime),
        'Cache-Control': 'private,no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Length': String(obj.size),
      },
    });
  } catch (e) {
    return fail(e);
  }
}
