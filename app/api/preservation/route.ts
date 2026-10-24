import { db, json, fail } from '@/lib/server';
export async function GET() {
  try {
    const last = await db()
      .prepare(
        'SELECT kind,status,updated_at FROM (SELECT kind,status,updated_at,ROW_NUMBER() OVER (PARTITION BY kind ORDER BY created_at DESC) position FROM maintenance_runs) WHERE position=1',
      )
      .all();
    return json({
      retentionDays: 7,
      independentCopy: false,
      runs: last.results,
      policy:
        'Daily encrypted internal recovery snapshots; original files preserved. Not an independent or permanent archive.',
    });
  } catch (e) {
    return fail(e);
  }
}
