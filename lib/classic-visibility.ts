import { db } from './server';
export async function hiddenClassics(): Promise<string[]> {
  const rows = await db()
    .prepare(
      "SELECT voice_id,action FROM (SELECT voice_id,action,ROW_NUMBER() OVER (PARTITION BY voice_id ORDER BY created_at DESC,id DESC) position FROM audit WHERE action IN ('hide_classic','restore_classic')) WHERE position=1 AND action='hide_classic'",
    )
    .all<{ voice_id: string; action: string }>();
  return rows.results.map((r) => r.voice_id.slice(6));
}
