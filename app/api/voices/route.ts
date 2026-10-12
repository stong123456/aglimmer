import { blockedReason } from '@/lib/moderation';
import { getTopic } from '@/lib/topics';
import { webmDuration } from '@/lib/audio-duration';
import { parseBuffer } from 'music-metadata';
import {
  db,
  bucket,
  identity,
  ensureProfile,
  json,
  fail,
  text,
  assertOrigin,
  HttpError,
  SELECT,
  toVoice,
} from '@/lib/server';
import { DEMOS, MOODS } from '@/lib/shared';
export async function GET(req: Request) {
  try {
    const u = await identity();
    const url = new URL(req.url);
    const mood = url.searchParams.get('mood');
    const mode = url.searchParams.get('mode') ?? 'featured';
    const topic = url.searchParams.get('topic');
    if (topic && topic !== 'podcast' && !getTopic(topic))
      throw new HttpError(400, '没有找到这个主题');
    const where = ["v.visibility='public'", "v.status='approved'"];
    const args: string[] = [];
    if (!topic) where.push("(v.topic IS NULL OR v.topic!='podcast')");
    if (mode === 'featured') where.push('v.featured=1');
    if (topic) {
      where.push('v.topic=?');
      args.push(topic);
    }
    if (mood) {
      where.push('v.mood=?');
      args.push(mood);
    }
    const rows = await db()
      .prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY v.created_at DESC LIMIT 60`)
      .bind(...args)
      .all();
    const reacts = u
      ? await db()
          .prepare('SELECT voice_id,kind FROM reactions WHERE user_id=?')
          .bind(u.userId)
          .all<{ voice_id: string; kind: string }>()
      : { results: [] };
    const values = rows.results.map((r) =>
      toVoice(
        r,
        reacts.results.some((a) => a.voice_id === r.id && a.kind === 'save'),
        reacts.results.some((a) => a.voice_id === r.id && a.kind === 'heart'),
      ),
    );
    const demos =
      values.length || topic
        ? []
        : DEMOS.filter((v) => (mode !== 'featured' || v.featured) && (!mood || v.mood === mood));
    return json({ voices: [...values, ...demos], demo: !values.length });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  try {
    assertOrigin(req);
    const u = (await identity(true))!;
    const length = Number(req.headers.get('content-length') ?? 0);
    if (length > 32 * 1024 * 1024) throw new HttpError(413, '请求不能超过 32 MB');
    const form = await req.formData();
    const topic = String(form.get('topic') ?? '');
    if (topic && topic !== 'podcast' && !getTopic(topic))
      throw new HttpError(400, '请选择有效的投稿主题');
    const podcast = topic === 'podcast';
    const maxBytes = (podcast ? 30 : 10) * 1024 * 1024;
    const audio = form.get('audio');
    if (!(audio instanceof File) || !audio.size || audio.size > maxBytes)
      throw new HttpError(400, `请选择不超过 ${podcast ? 30 : 10} MB 的音频`);
    const allowed = [
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
      'audio/x-wav',
      'audio/ogg',
    ];
    const mime = audio.type.split(';')[0];
    if (!allowed.includes(mime)) throw new HttpError(400, '支持 WebM、MP4、MP3、WAV 和 OGG 音频');
    const bytes = new Uint8Array(await audio.arrayBuffer());
    let measured = 0;
    try {
      const meta = await parseBuffer(
        bytes,
        { mimeType: mime, size: bytes.length },
        { duration: true },
      );
      if (!meta.format.codec || !meta.format.numberOfChannels) throw new Error('Not audio');
      measured = meta.format.duration ?? 0;
    } catch {
      throw new HttpError(400, '无法识别音频内容，请上传有效的 MP3、WAV、WebM、MP4 或 OGG');
    }
    const title = text(form.get('title'), 60, '标题', true),
      signature = text(form.get('signature'), 24, '署名', true),
      transcript = text(form.get('transcript') ?? '', podcast ? 15000 : 3000, '文字稿'),
      source = text(form.get('source') ?? '', 300, '引用出处');
    const blocked = blockedReason(title + ' ' + transcript);
    if (blocked) throw new HttpError(400, blocked);
    const mood = String(form.get('mood')),
      visibility = String(form.get('visibility'));
    if (
      !MOODS.includes(mood as (typeof MOODS)[number]) ||
      !['public', 'private'].includes(visibility)
    )
      throw new HttpError(400, '请选择有效的心情与可见范围');
    const duration = measured || (mime === 'audio/webm' ? webmDuration(bytes) : 0);
    if (
      !Number.isFinite(duration) ||
      duration < (podcast ? 60 : 1) ||
      duration > (podcast ? 1800.5 : 90.5)
    )
      throw new HttpError(400, podcast ? '播客长度为 1–30 分钟' : '录音长度为 1–90 秒');
    const recordedAt = String(form.get('recordedAt'));
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(recordedAt) ||
      Number.isNaN(Date.parse(recordedAt)) ||
      new Date(recordedAt).toISOString().slice(0, 10) !== recordedAt ||
      new Date(recordedAt) > new Date(Date.now() + 86400000)
    )
      throw new HttpError(400, '请填写有效的录制日期');
    const futureRaw = form.get('futureYear'),
      futureYear = futureRaw ? Number(futureRaw) : null;
    const year = new Date().getUTCFullYear();
    if (
      futureYear !== null &&
      (!Number.isInteger(futureYear) || futureYear < year || futureYear > year + 100)
    )
      throw new HttpError(400, '未来年份超出范围');
    const parentId = form.get('parentId') ? String(form.get('parentId')) : null;
    if (parentId) {
      const parent = await db()
        .prepare('SELECT id FROM voices WHERE id=? AND owner_id=?')
        .bind(parentId, u.userId)
        .first();
      if (!parent) throw new HttpError(400, '只能回应自己的声音');
    }
    await ensureProfile(u.userId);
    const quota = await db()
      .prepare('SELECT COUNT(*) n,COALESCE(SUM(size),0) bytes FROM voices WHERE owner_id=?')
      .bind(u.userId)
      .first<{ n: number; bytes: number }>();
    if ((quota?.n ?? 0) >= 200 || (quota?.bytes ?? 0) + audio.size > 500 * 1024 * 1024)
      throw new HttpError(429, '声音档案已达到容量上限，请先导出整理');
    const recent = await db()
      .prepare('SELECT COUNT(*) n FROM voices WHERE owner_id=? AND created_at>?')
      .bind(u.userId, new Date(Date.now() - 3600000).toISOString())
      .first<{ n: number }>();
    if ((recent?.n ?? 0) >= 10) throw new HttpError(429, '请慢慢录，每小时最多保存 10 段声音');
    const id = crypto.randomUUID(),
      key = `voices/${u.userId}/${id}`,
      createdAt = new Date().toISOString();
    await bucket().put(key, bytes, { httpMetadata: { contentType: mime } });
    try {
      await db()
        .prepare(
          'INSERT INTO voices(id,owner_id,title,signature,recorded_at,created_at,mood,transcript,source,duration,size,audio_key,mime,visibility,status,future_year,parent_id,topic) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          id,
          u.userId,
          title,
          signature,
          recordedAt,
          createdAt,
          mood,
          transcript,
          source,
          Math.round(duration),
          audio.size,
          key,
          mime,
          visibility,
          visibility === 'public' ? 'pending' : 'private',
          futureYear,
          parentId,
          topic || null,
        )
        .run();
    } catch (e) {
      await bucket().delete(key);
      throw e;
    }
    return json({ id, status: visibility === 'public' ? 'pending' : 'private' }, 201);
  } catch (e) {
    return fail(e);
  }
}
