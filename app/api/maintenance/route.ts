import { identity, isAdmin, assertOrigin, readBody, json, fail, HttpError } from '@/lib/server';
import {
  maintenanceAuthorized,
  backupStep,
  restoreDrill,
  scanSources,
  maintenanceStatus,
} from '@/lib/maintenance';
async function allowed(req: Request) {
  if (await maintenanceAuthorized(req)) return;
  const user = await identity(true);
  if (!user || !isAdmin(user.userId)) throw new HttpError(403, '需要审核员权限');
}
export async function GET(req: Request) {
  try {
    await allowed(req);
    return json(await maintenanceStatus());
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  try {
    assertOrigin(req);
    await allowed(req);
    const body = await readBody(req);
    if (body.action === 'backup') return json(await backupStep());
    if (body.action === 'drill') return json(await restoreDrill());
    if (body.action === 'sources') return json(await scanSources());
    throw new HttpError(400, '无效维护操作');
  } catch (e) {
    return fail(e);
  }
}
