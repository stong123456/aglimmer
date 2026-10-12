import { authConfig } from '@/lib/auth-server';
import { json } from '@/lib/server';
export async function GET() {
  const c = authConfig();
  return json({
    ready: c.ready,
    captchaSiteKey: c.captchaSiteKey,
    localDemo: c.localDemo && !c.ready,
  });
}
