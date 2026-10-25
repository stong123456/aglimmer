import { OFFICIAL_SOURCES } from '@/lib/official-sources';
import { CLASSIC_QUOTES } from '@/lib/quotes';
import { hiddenClassics } from '@/lib/classic-visibility';
import { db, fail, json } from '@/lib/server';
export async function GET(req: Request) {
  try {
    const hidden = await hiddenClassics();
    const full = new URL(req.url).searchParams.get('catalog') === '1';
    const health = full
      ? await db().prepare('SELECT id,status,checked_at FROM source_health').all()
      : null;
    return json({
      hidden,
      ...(health ? { health: health.results } : {}),
      ...(new URL(req.url).searchParams.get('catalog') === '1'
        ? {
            items: CLASSIC_QUOTES.filter((q) => !hidden.includes(q.id)),
            officialSources: OFFICIAL_SOURCES.filter((q) => !hidden.includes(q.id)),
          }
        : {}),
    });
  } catch (e) {
    return fail(e);
  }
}
