import { createServerClient, type CookieMethodsServer } from '@supabase/ssr';
import { authCookieOptions } from './auth-core.ts';
export function createAuthClient(
  url: string,
  key: string,
  cookies: CookieMethodsServer,
  production: boolean,
  fetcher: typeof fetch = fetch,
) {
  return createServerClient(url, key, {
    cookieOptions: authCookieOptions(production),
    cookies,
    global: { fetch: fetcher },
  });
}
