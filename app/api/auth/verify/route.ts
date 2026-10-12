import { authClient, mapVerifiedUser } from '@/lib/auth-server';
import { normalizeEmail, validOtp } from '@/lib/auth-core';
import { authRateLimit } from '@/lib/auth-throttle';
import { readBody, assertOrigin, json, fail, HttpError, isAdmin } from '@/lib/server';
export async function POST(req: Request) {
  try {
    assertOrigin(req);
    const body = await readBody(req),
      email = normalizeEmail(body.email);
    if (!email || !validOtp(body.token)) throw new HttpError(400, '请输入邮箱和六位数字验证码。');
    const client = await authClient();
    if (!client) throw new HttpError(503, '邮箱登录尚未接通，请等待平台配置完成。');
    await authRateLimit('verify-email', email, 5, 600);
    const ip = req.headers.get('cf-connecting-ip');
    if (ip) await authRateLimit('verify-ip', ip, 50, 600);
    const { data, error } = await client.auth.verifyOtp({
      email,
      token: body.token,
      type: 'email',
    });
    if (error || !data.session || !data.user)
      throw new HttpError(400, '验证码无效或已过期，请检查后重试。');
    const user = await mapVerifiedUser(data.user);
    if (!user) throw new HttpError(401, '邮箱尚未验证。');
    return json({
      ok: true,
      isNew: user.isNew,
      user: {
        userId: user.userId,
        nickname: user.displayName,
        email: user.email,
        admin: isAdmin(user.userId),
      },
    });
  } catch (e) {
    return fail(e);
  }
}
