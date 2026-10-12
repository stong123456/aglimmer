import { bucket, identity, isAdmin, findVoice, fail, HttpError } from '@/lib/server';
export async function GET(req: Request, c: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await c.params;
    const u = await identity();
    const v = await findVoice(id, u?.userId, u ? isAdmin(u.userId) : false);
    if (!v || id.startsWith('demo-')) throw new HttpError(404, '音频不存在');
    const row = v as Record<string, unknown>;
    const obj = await bucket().get(String(row.audio_key));
    if (!obj) throw new HttpError(404, '音频文件不存在');
    const headers = new Headers({
      'Content-Type': String(row.mime),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    headers.set('Content-Length', String(obj.size));
    return new Response(obj.body, { headers });
  } catch (e) {
    return fail(e);
  }
}
