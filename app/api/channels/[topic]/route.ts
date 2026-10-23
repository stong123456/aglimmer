import {
  db,
  bucket,
  identity,
  ensureProfile,
  json,
  fail,
  HttpError,
  assertOrigin,
  text,
  SELECT,
  toVoice,
} from '@/lib/server';
import { getTopic } from '@/lib/topics';
import { blockedReason, validImage, type ChannelMessage } from '@/lib/moderation';
import {
  CHANNEL_PAGE_SIZE,
  compareChannelMessages,
  encodeChannelCursor,
  olderChannelRows,
  parseChannelCursor,
} from '@/lib/channel-history';
export async function GET(req: Request, c: { params: Promise<{ topic: string }> }) {
  try {
    const { topic } = await c.params;
    if (!getTopic(topic)) throw new HttpError(404, '频道不存在');
    const u = await identity();
    const before = new URL(req.url).searchParams.get('before');
    const cursor = before === null ? null : parseChannelCursor(before);
    if (before !== null && !cursor) throw new HttpError(400, '消息位置无效，请刷新频道后重试。');
    const messagePage = olderChannelRows(cursor, 'm');
    const voicePage = olderChannelRows(cursor, 'v', 'v.');
    const [rows, voiceRows] = await Promise.all([
      db()
        .prepare(
          `SELECT * FROM messages WHERE topic=? AND (status='approved' OR owner_id=?)${messagePage.sql} ORDER BY created_at DESC,id DESC LIMIT ${CHANNEL_PAGE_SIZE + 1}`,
        )
        .bind(topic, u?.userId ?? '', ...messagePage.values)
        .all(),
      db()
        .prepare(
          `${SELECT} WHERE v.topic=? AND v.visibility='public' AND (v.status='approved' OR v.owner_id=?)${voicePage.sql} ORDER BY v.created_at DESC,v.id DESC LIMIT ${CHANNEL_PAGE_SIZE + 1}`,
        )
        .bind(topic, u?.userId ?? '', ...voicePage.values)
        .all(),
    ]);
    const messages: ChannelMessage[] = rows.results.map((r) => ({
      id: String(r.id),
      kind: r.kind as 'text' | 'image',
      body: String(r.body),
      signature: String(r.signature),
      createdAt: String(r.created_at),
      status: String(r.status),
      reviewNote: String(r.review_note),
      mine: r.owner_id === u?.userId,
      ...(r.kind === 'image' ? { mediaUrl: `/api/messages/${r.id}/media` } : {}),
    }));
    for (const r of voiceRows.results)
      messages.push({
        id: String(r.id),
        kind: 'voice',
        body: String(r.transcript),
        signature: String(r.signature),
        createdAt: String(r.created_at),
        status: String(r.status),
        reviewNote: String(r.review_note),
        mine: r.owner_id === u?.userId,
        voice: toVoice(r),
      });
    const ordered = messages.sort((a, b) => -compareChannelMessages(a, b));
    const page = ordered.slice(0, CHANNEL_PAGE_SIZE);
    const nextCursor =
      ordered.length > CHANNEL_PAGE_SIZE ? encodeChannelCursor(page[page.length - 1]) : null;
    return json({
      messages: page.reverse(),
      nextCursor,
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request, c: { params: Promise<{ topic: string }> }) {
  try {
    assertOrigin(req);
    const u = (await identity(true))!;
    const { topic } = await c.params;
    if (!getTopic(topic)) throw new HttpError(404, '频道不存在');
    if (Number(req.headers.get('content-length') ?? 0) > 6 * 1024 * 1024)
      throw new HttpError(413, '图片不能超过 5 MB');
    const f = await req.formData();
    const kind = String(f.get('kind'));
    if (!['text', 'image'].includes(kind)) throw new HttpError(400, '请选择文字或图片');
    const body = text(f.get('body') ?? '', 1000, '消息', kind === 'text');
    const reason = blockedReason(body);
    if (reason) throw new HttpError(400, reason);
    await ensureProfile(u.userId);
    const quota = await db()
      .prepare('SELECT COUNT(*) n,COALESCE(SUM(size),0) bytes FROM messages WHERE owner_id=?')
      .bind(u.userId)
      .first<{ n: number; bytes: number }>();
    if ((quota?.n ?? 0) >= 1000 || (quota?.bytes ?? 0) >= 100 * 1024 * 1024)
      throw new HttpError(429, '频道消息容量已满，请整理自己的消息');
    const recent = await db()
      .prepare('SELECT COUNT(*) n FROM messages WHERE owner_id=? AND created_at>?')
      .bind(u.userId, new Date(Date.now() - 60000).toISOString())
      .first<{ n: number }>();
    if ((recent?.n ?? 0) >= 5) throw new HttpError(429, '慢一点说，每分钟最多发送 5 条');
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    let key: string | null = null,
      mime: string | null = null,
      size = 0;
    if (kind === 'image') {
      const file = f.get('image');
      if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024)
        throw new HttpError(400, '请选择不超过 5 MB 的 PNG、JPEG 或 WebP 图片');
      mime = file.type;
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!validImage(bytes, mime))
        throw new HttpError(400, '无法识别图片内容，仅支持 PNG、JPEG 和 WebP');
      size = file.size;
      if ((quota?.bytes ?? 0) + size > 100 * 1024 * 1024) throw new HttpError(429, '图片容量不足');
      key = `channels/${u.userId}/${id}`;
      await bucket().put(key, bytes, { httpMetadata: { contentType: mime } });
    }
    const profile = await db()
      .prepare('SELECT nickname FROM profiles WHERE id=?')
      .bind(u.userId)
      .first<{ nickname: string }>();
    try {
      await db()
        .prepare(
          'INSERT INTO messages(id,owner_id,topic,kind,body,signature,created_at,status,media_key,mime,size) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(id, u.userId, topic, kind, body, profile!.nickname, now, 'pending', key, mime, size)
        .run();
    } catch (e) {
      if (key) await bucket().delete(key);
      throw e;
    }
    return json({ id, status: 'pending' }, 201);
  } catch (e) {
    return fail(e);
  }
}
