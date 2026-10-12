import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { validSupabaseConfig } from './auth-core';
import { createAuthClient } from './supabase-client';
export function authConfig() {
  const url = env.SUPABASE_URL?.trim() ?? '',
    key = (env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY)?.trim() ?? '';
  return {
    url,
    key,
    ready: validSupabaseConfig(url, key),
    captchaSiteKey: env.TURNSTILE_SITE_KEY?.trim() ?? '',
    localDemo: process.env.NODE_ENV === 'development',
  };
}
export async function authClient() {
  const c = authConfig();
  if (!c.ready) return null;
  const store = await cookies();
  return createAuthClient(
    c.url,
    c.key,
    {
      getAll: () => store.getAll(),
      setAll: (values) => {
        for (const { name, value, options } of values) store.set(name, value, options);
      },
    },
    process.env.NODE_ENV === 'production',
  );
}
export type AppIdentity = {
  userId: string;
  email: string;
  displayName: string;
  provider: 'supabase' | 'local';
  isNew?: boolean;
};
export async function mapVerifiedUser(user: {
  id: string;
  email?: string;
  email_confirmed_at?: string;
}): Promise<AppIdentity | null> {
  if (!user.id || !user.email || !user.email_confirmed_at) return null;
  if (!env.DB) throw new Error('Database unavailable');
  const subject = 'supabase:' + user.id;
  const result = await env.DB.prepare(
    'INSERT OR IGNORE INTO auth_identities(subject,user_id,created_at) VALUES(?,?,?)',
  )
    .bind(subject, crypto.randomUUID(), new Date().toISOString())
    .run();
  const link = await env.DB.prepare('SELECT user_id FROM auth_identities WHERE subject=?')
    .bind(subject)
    .first<{ user_id: string }>();
  if (!link) throw new Error('Identity not mapped');
  await env.DB.prepare('INSERT OR IGNORE INTO profiles(id,nickname,created_at) VALUES(?,?,?)')
    .bind(link.user_id, '一位留光的人', new Date().toISOString())
    .run();
  const profile = await env.DB.prepare('SELECT nickname FROM profiles WHERE id=?')
    .bind(link.user_id)
    .first<{ nickname: string }>();
  return {
    userId: link.user_id,
    email: user.email,
    displayName: profile!.nickname,
    provider: 'supabase',
    isNew: result.meta.changes === 1,
  };
}
export async function getAppIdentity(): Promise<AppIdentity | null> {
  const client = await authClient();
  if (client) {
    const { data, error } = await client.auth.getUser();
    if (error) {
      if (
        error.name === 'AuthRetryableFetchError' ||
        error.status === 429 ||
        (error.status && error.status >= 500)
      )
        throw new Error('Identity provider unavailable');
      return null;
    }
    return data.user ? mapVerifiedUser(data.user) : null;
  }
  // Development-only compatibility with the starter's fixed local identity.
  // Never trust dispatch/user headers as an email identity in production.
  if (process.env.NODE_ENV === 'development') {
    const local = await getChatGPTUser();
    if (local?.userId === 'local_seedy')
      return {
        userId: local.userId,
        email: local.email,
        displayName: '一位留光的人',
        provider: 'local',
      };
  }
  return null;
}
