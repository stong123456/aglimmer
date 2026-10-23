import { hiddenClassics } from '@/lib/classic-visibility';
import { fail, json } from '@/lib/server';
export async function GET() {
  try {
    return json({ hidden: await hiddenClassics() });
  } catch (e) {
    return fail(e);
  }
}
