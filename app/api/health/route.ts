import { db, bucket, json, fail } from '@/lib/server';
export async function GET() {
  try {
    await db().prepare('SELECT COUNT(*) n FROM profiles').first();
    await bucket().head('__health__');
    return json({ ok: true, storage: 'D1 + R2' });
  } catch (e) {
    return fail(e);
  }
}
