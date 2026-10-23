import { CLASSIC_QUOTES } from '@/lib/quotes';
import { hiddenClassics } from '@/lib/classic-visibility';
import { fail, json } from '@/lib/server';
export async function GET(req: Request) {
  try {
    const hidden = await hiddenClassics();
    return json({
      hidden,
      ...(new URL(req.url).searchParams.get('catalog') === '1'
        ? { items: CLASSIC_QUOTES.filter((q) => !hidden.includes(q.id)) }
        : {}),
    });
  } catch (e) {
    return fail(e);
  }
}
