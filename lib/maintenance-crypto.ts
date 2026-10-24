const enc = new TextEncoder();
export const hex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes)].map((n) => n.toString(16).padStart(2, '0')).join('');
export const sha256 = async (bytes: Uint8Array | string) =>
  hex(
    await crypto.subtle.digest(
      'SHA-256',
      typeof bytes === 'string' ? enc.encode(bytes) : (bytes as BufferSource),
    ),
  );
export async function seal(bytes: Uint8Array, secret: string, context: string) {
  if (!/^[a-f0-9]{64}$/.test(secret)) throw Error('Backup encryption is not configured');
  const raw = Uint8Array.from(secret.match(/../g)!, (v) => parseInt(v, 16));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(context) },
    key,
    bytes as BufferSource,
  );
  const out = new Uint8Array(12 + encrypted.byteLength);
  out.set(iv);
  out.set(new Uint8Array(encrypted), 12);
  return out;
}
export async function unseal(bytes: Uint8Array, secret: string, context: string) {
  if (bytes.length < 28 || !/^[a-f0-9]{64}$/.test(secret)) throw Error('Invalid encrypted backup');
  const key = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(secret.match(/../g)!, (v) => parseInt(v, 16)),
    'AES-GCM',
    false,
    ['decrypt'],
  );
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: enc.encode(context) },
      key,
      bytes.slice(12),
    ),
  );
}
export const BACKUP_TABLES = [
  'profiles',
  'voices',
  'messages',
  'reactions',
  'reports',
  'audit',
  'auth_identities',
  'account_closures',
  'closed_identities',
] as const;
export type Tables = Record<string, Record<string, unknown>[]>;
export type Tombstone = { key: string; kind: string; resource_id: string };
// Restoration is deliberately private/pending and never republishes a historical permission state.
export function safeRestoreRows(tables: Tables, deletions: Tombstone[]): Tables {
  const gone = (kind: string, id: unknown) =>
    deletions.some((d) => d.kind === kind && d.resource_id === id);
  const users = new Set(
    (tables.profiles ?? []).filter((r) => !gone('account', r.id)).map((r) => r.id),
  );
  const profiles = (tables.profiles ?? [])
    .filter((r) => users.has(r.id))
    .map((r) => ({
      ...r,
      ...(deletions.some((d) => d.key === r.avatar_key)
        ? { avatar_key: null, avatar_mime: null }
        : {}),
    }));
  const voices: Record<string, unknown>[] = (tables.voices ?? [])
    .filter(
      (r) =>
        users.has(r.owner_id) &&
        !gone('voice', r.id) &&
        !deletions.some((d) => d.key === r.audio_key),
    )
    .map((r) => ({ ...r, visibility: 'private', status: 'private', featured: 0 }));
  const ids = new Set<unknown>(voices.map((r) => r.id));
  for (const r of voices) if (r.parent_id && !ids.has(r.parent_id)) r.parent_id = null;
  const messages: Record<string, unknown>[] = (tables.messages ?? [])
    .filter(
      (r) =>
        users.has(r.owner_id) &&
        !gone('message', r.id) &&
        !deletions.some((d) => d.key === r.media_key),
    )
    .map((r) => ({ ...r, status: 'pending' }));
  const messageIds = new Set<unknown>(messages.map((r) => 'message:' + r.id));
  return {
    profiles,
    voices,
    messages,
    reactions: (tables.reactions ?? []).filter((r) => users.has(r.user_id) && ids.has(r.voice_id)),
    reports: (tables.reports ?? []).filter(
      (r) =>
        users.has(r.user_id) &&
        (ids.has(r.voice_id) ||
          messageIds.has(r.voice_id) ||
          String(r.voice_id).startsWith('quote:')),
    ),
    audit: (tables.audit ?? []).filter(
      (r) =>
        users.has(r.actor_id) &&
        (ids.has(r.voice_id) ||
          messageIds.has(r.voice_id) ||
          String(r.voice_id).startsWith('quote:')),
    ),
    auth_identities: (tables.auth_identities ?? []).filter((r) => users.has(r.user_id)),
    account_closures: tables.account_closures ?? [],
    closed_identities: tables.closed_identities ?? [],
  };
}
