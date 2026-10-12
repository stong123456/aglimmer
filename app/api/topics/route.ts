import { db, json, fail, SELECT, toVoice } from '@/lib/server';
import { TOPICS } from '@/lib/topics';
export async function GET() {
  try {
    const [counts, rows] = await Promise.all([
      db()
        .prepare(
          "SELECT topic,COUNT(*) count FROM (SELECT topic FROM voices WHERE visibility='public' AND status='approved' AND topic IS NOT NULL UNION ALL SELECT topic FROM messages WHERE status='approved') GROUP BY topic",
        )
        .all<{ topic: string; count: number }>(),
      db()
        .prepare(
          `${SELECT} WHERE v.visibility='public' AND v.status='approved' AND v.topic IS NOT NULL AND v.id IN (SELECT id FROM (SELECT id,ROW_NUMBER() OVER(PARTITION BY topic ORDER BY created_at DESC) rn FROM voices WHERE visibility='public' AND status='approved' AND topic IS NOT NULL) WHERE rn<=2) ORDER BY v.created_at DESC`,
        )
        .all(),
    ]);
    return json({
      topics: TOPICS.map((t) => ({
        id: t.id,
        count: counts.results.find((c) => c.topic === t.id)?.count ?? 0,
        voices: rows.results.filter((v) => v.topic === t.id).map((v) => toVoice(v)),
      })),
    });
  } catch (e) {
    return fail(e);
  }
}
