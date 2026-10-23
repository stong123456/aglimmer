import { env } from 'cloudflare:workers';
import { authConfig } from '@/lib/auth-server';
import { db, bucket, identity, isAdmin, json, fail, HttpError } from '@/lib/server';
export async function GET() {
  try {
    const u = (await identity(true))!;
    if (!isAdmin(u.userId)) throw new HttpError(403, '需要审核员权限');
    await Promise.all([
      db().prepare('SELECT COUNT(*) n FROM profiles').first(),
      bucket().head('__health__'),
    ]);
    const settings = env as unknown as Record<string, string | undefined>;
    return json({
      checkedAt: new Date().toISOString(),
      checks: {
        storage: true,
        authentication: authConfig().ready,
        moderators: !!settings.ADMIN_USER_IDS?.trim(),
        captcha: !!settings.TURNSTILE_SITE_KEY?.trim(),
        emailDeliveryVerified: settings.EMAIL_DELIVERY_VERIFIED === 'true',
        restoreVerified:
          !!settings.BACKUP_RESTORE_VERIFIED_AT &&
          Number.isFinite(Date.parse(settings.BACKUP_RESTORE_VERIFIED_AT)),
      },
    });
  } catch (e) {
    return fail(e);
  }
}
