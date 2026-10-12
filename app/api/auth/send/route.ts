import { authClient, authConfig } from '@/lib/auth-server';
import { normalizeEmail } from '@/lib/auth-core';
import { authRateLimit } from '@/lib/auth-throttle';
import { readBody, assertOrigin, json, fail, HttpError } from '@/lib/server';
export async function POST(req: Request) {
  try {
    assertOrigin(req);
    const body = await readBody(req),
      email = normalizeEmail(body.email);
    if (!email) throw new HttpError(400, '请填写有效的邮箱地址。');
    const client = await authClient();
    if (!client) throw new HttpError(503, '邮箱登录尚未接通，请等待平台配置完成。');
    const captchaToken = typeof body.captchaToken === 'string' ? body.captchaToken : '';
    if (authConfig().captchaSiteKey && !captchaToken)
      throw new HttpError(400, '请先完成人机验证。');
    await authRateLimit('send-email', email, 1, 60);
    const ip = req.headers.get('cf-connecting-ip');
    if (ip) await authRateLimit('send-ip', ip, 30, 300);
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, ...(captchaToken ? { captchaToken } : {}) },
    });
    if (error)
      throw new HttpError(
        error.status === 429 ? 429 : 503,
        error.status === 429 ? '请稍等一分钟，再获取验证码。' : '暂时无法发送邮件，请稍后再试。',
      );
    return json({ ok: true, retryAfter: 60 });
  } catch (e) {
    return fail(e);
  }
}
