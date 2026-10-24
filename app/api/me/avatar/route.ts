import { markDeleted } from '@/lib/maintenance';
import {
  identity,
  db,
  bucket,
  ensureProfile,
  json,
  fail,
  assertOrigin,
  HttpError,
} from '@/lib/server';
import { validAvatar } from '@/lib/avatar';
export async function GET() {
  try {
    const u = (await identity(true))!;
    const p = await db()
      .prepare('SELECT avatar_key,avatar_mime FROM profiles WHERE id=?')
      .bind(u.userId)
      .first<{ avatar_key: string | null; avatar_mime: string | null }>();
    if (!p?.avatar_key) throw new HttpError(404, '没有设置头像');
    const obj = await bucket().get(p.avatar_key);
    if (!obj) throw new HttpError(404, '头像暂时不可用');
    return new Response(obj.body, {
      headers: {
        'Content-Type': p.avatar_mime || 'image/jpeg',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  try {
    assertOrigin(req);
    const u = (await identity(true))!;
    if (Number(req.headers.get('content-length') || 0) > 3 * 1024 * 1024)
      throw new HttpError(413, '头像不能超过 2 MB');
    const form = await req.formData();
    const file = form.get('avatar');
    if (
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > 2 * 1024 * 1024 ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
    )
      throw new HttpError(400, '请选择 2 MB 以内的 PNG、JPEG 或 WebP 头像。');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validAvatar(bytes, file.type))
      throw new HttpError(400, '请选择不超过 2048 像素的有效图片。');
    await ensureProfile(u.userId);
    const old = await db()
      .prepare('SELECT avatar_key FROM profiles WHERE id=?')
      .bind(u.userId)
      .first<{ avatar_key: string | null }>();
    const key = `avatars/${u.userId}/${crypto.randomUUID()}`;
    await bucket().put(key, bytes, { httpMetadata: { contentType: file.type } });
    try {
      const result = await db()
        .prepare('UPDATE profiles SET avatar_key=?,avatar_mime=? WHERE id=? AND avatar_key IS ?')
        .bind(key, file.type, u.userId, old?.avatar_key ?? null)
        .run();
      if (!result.meta.changes) throw new HttpError(409, '头像刚刚发生变化，请刷新后重试。');
    } catch (e) {
      await bucket().delete(key);
      throw e;
    }
    if (old?.avatar_key) {
      await markDeleted('avatar', u.userId, old.avatar_key);
      await bucket().delete(old.avatar_key);
    }
    return json({ avatarUrl: '/api/me/avatar?v=' + key.split('/').at(-1) }, 201);
  } catch (e) {
    return fail(e);
  }
}
export async function DELETE(req: Request) {
  try {
    assertOrigin(req);
    const u = (await identity(true))!;
    const old = await db()
      .prepare('SELECT avatar_key FROM profiles WHERE id=?')
      .bind(u.userId)
      .first<{ avatar_key: string | null }>();
    const result = await db()
      .prepare(
        'UPDATE profiles SET avatar_key=NULL,avatar_mime=NULL WHERE id=? AND avatar_key IS ?',
      )
      .bind(u.userId, old?.avatar_key ?? null)
      .run();
    if (old && !result.meta.changes) throw new HttpError(409, '头像刚刚发生变化，请刷新后重试。');
    if (old?.avatar_key) {
      await markDeleted('avatar', u.userId, old.avatar_key);
      await bucket().delete(old.avatar_key);
    }
    return json({ avatarUrl: null });
  } catch (e) {
    return fail(e);
  }
}
