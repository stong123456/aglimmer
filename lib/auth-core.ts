export function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
export function validOtp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{6}$/.test(value);
}
export function validSupabaseConfig(url: string, key: string) {
  try {
    const u = new URL(url);
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.pathname !== '/' ||
      u.search ||
      u.hash
    )
      return false;
    if (key.startsWith('sb_publishable_')) return key.length > 20;
    const parts = key.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replaceAll('-', '+').replaceAll('_', '/')));
    return payload.role === 'anon';
  } catch {
    return false;
  }
}
export const authCookieOptions = (production: boolean) => ({
  httpOnly: true,
  secure: production,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
});
export async function throttleHash(scope: string, value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(scope + ':' + value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
