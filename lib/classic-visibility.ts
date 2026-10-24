import { db } from './server';
import { WITHDRAWN_CLASSIC_IDS } from './quotes';
export async function hiddenClassics(): Promise<string[]> {
  const rows = await db()
    .prepare(
      "SELECT voice_id,action FROM (SELECT voice_id,action,ROW_NUMBER() OVER (PARTITION BY voice_id ORDER BY created_at DESC,id DESC) position FROM audit WHERE action IN ('hide_classic','restore_classic')) WHERE position=1 AND action='hide_classic'",
    )
    .all<{ voice_id: string; action: string }>();
  const failed = await db()
    .prepare('SELECT id FROM source_health WHERE failures>=2')
    .all<{ id: string }>();
  return [
    ...new Set([
      ...WITHDRAWN_CLASSIC_IDS,
      ...rows.results.map((r) => r.voice_id.slice(6)),
      ...failed.results.map((r) => r.id),
    ]),
  ];
}
