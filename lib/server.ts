import { env } from 'cloudflare:workers';
import { getAppIdentity } from './auth-server';
import { DEMOS, type Voice } from './shared';
export const db = () => {
  if (!env.DB) throw new Error('数据库不可用');
  return env.DB;
};
export const bucket = () => {
  if (!env.BUCKET) throw new Error('音频存储不可用');
  return env.BUCKET;
};
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function identity(required = false) {
  const u = await getAppIdentity();
  if (required && !u) throw new HttpError(401, '请先登录，再保存你的声音。');
  return u;
}
export function isAdmin(id: string) {
  const admins =
    (env as unknown as { ADMIN_USER_IDS?: string }).ADMIN_USER_IDS?.split(',').map((s) =>
      s.trim(),
    ) ?? [];
  return admins.includes(id) || (process.env.NODE_ENV === 'development' && id === 'local_seedy');
}
export function assertOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) throw new HttpError(403, '请从本站提交操作。');
}
export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function fail(err: unknown) {
  if (err instanceof HttpError) return json({ error: err.message }, err.status);
  console.error(err instanceof Error ? err.message : 'API error');
  return json({ error: '服务暂时不可用，请稍后再试。' }, 503);
}
export function text(value: unknown, max: number, name: string, required = false) {
  if (typeof value !== 'string') throw new HttpError(400, `${name}格式不正确`);
  const s = value.trim();
  if (s.length > max || (required && !s)) throw new HttpError(400, `${name}请填写 1–${max} 个字符`);
  return s;
}
export async function ensureProfile(userId: string) {
  await db()
    .prepare('INSERT OR IGNORE INTO profiles(id,nickname,created_at) VALUES(?,?,?)')
    .bind(userId, '一位留光的人', new Date().toISOString())
    .run();
}
export const SELECT = `SELECT v.*, (SELECT COUNT(*) FROM reactions r WHERE r.voice_id=v.id AND r.kind='heart') AS hearts FROM voices v`;
export function toVoice(row: Record<string, unknown>, saved = false, loved = false): Voice {
  return {
    id: String(row.id),
    title: String(row.title),
    signature: String(row.signature),
    recordedAt: String(row.recorded_at),
    createdAt: String(row.created_at),
    mood: String(row.mood),
    topic: row.topic ? String(row.topic) : null,
    transcript: String(row.transcript),
    source: String(row.source),
    duration: Number(row.duration),
    size: Number(row.size),
    visibility: String(row.visibility),
    status: String(row.status),
    featured: Number(row.featured),
    futureYear: row.future_year ? Number(row.future_year) : null,
    parentId: row.parent_id ? String(row.parent_id) : null,
    reviewNote: String(row.review_note ?? ''),
    hearts: Number(row.hearts ?? 0),
    saved,
    loved,
    audioUrl: `/api/voices/${row.id}/audio`,
  };
}
export async function findVoice(id: string, userId?: string, admin = false) {
  if (id.startsWith('demo-')) return DEMOS.find((v) => v.id === id) ?? null;
  const row = await db()
    .prepare(`${SELECT} WHERE v.id=?`)
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return null;
  if (
    !(row.visibility === 'public' && row.status === 'approved') &&
    row.owner_id !== userId &&
    !(admin && row.visibility === 'public')
  )
    throw new HttpError(404, '没有找到这段声音');
  return row;
}

export async function readBody(req: Request) {
  try {
    const b = await req.json();
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error();
    return b as Record<string, unknown>;
  } catch {
    throw new HttpError(400, '请求格式不正确');
  }
}
