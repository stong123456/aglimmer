import { CLASSIC_QUOTES, WITHDRAWN_CLASSIC_IDS } from './quotes.ts';
import { OFFICIAL_SOURCES } from './official-sources.ts';
export function sourceRecord(id: string) {
  const q = CLASSIC_QUOTES.find((q) => q.id === id);
  if (q)
    return {
      id,
      title: q.work,
      credit: q.media.credit,
      retired: WITHDRAWN_CLASSIC_IDS.includes(id),
    };
  const s = OFFICIAL_SOURCES.find((s) => s.id === id);
  return s ? { id, title: s.title, credit: s.publisher, retired: false } : undefined;
}
