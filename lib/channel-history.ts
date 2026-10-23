import type { ChannelMessage } from './moderation';

export const CHANNEL_PAGE_SIZE = 60;
type MessagePosition = Pick<ChannelMessage, 'id' | 'kind' | 'createdAt'>;
export type ChannelCursor = { createdAt: string; source: 'm' | 'v'; id: string };
const source = (m: Pick<ChannelMessage, 'kind'>) => (m.kind === 'voice' ? 'v' : 'm');
export const channelMessageKey = (m: Pick<ChannelMessage, 'kind' | 'id'>) => source(m) + ':' + m.id;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function compareChannelMessages(a: MessagePosition, b: MessagePosition) {
  return compare(a.createdAt, b.createdAt) || compare(source(a), source(b)) || compare(a.id, b.id);
}
export function mergeChannelMessages(older: ChannelMessage[], current: ChannelMessage[]) {
  const entries = new Map<string, ChannelMessage>();
  for (const m of [...older, ...current]) entries.set(channelMessageKey(m), m);
  return [...entries.values()].sort(compareChannelMessages);
}
export function encodeChannelCursor(m: MessagePosition) {
  return btoa(JSON.stringify([m.createdAt, source(m), m.id]))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
export function parseChannelCursor(value: string): ChannelCursor | null {
  try {
    if (!value || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
    const parts: unknown = JSON.parse(atob(value.replaceAll('-', '+').replaceAll('_', '/')));
    if (!Array.isArray(parts) || parts.length !== 3) return null;
    const [createdAt, stream, id] = parts;
    if (
      typeof createdAt !== 'string' ||
      !createdAt ||
      new Date(createdAt).toISOString().replace('.000Z', 'Z') !== createdAt.replace('.000Z', 'Z') ||
      (stream !== 'm' && stream !== 'v') ||
      typeof id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(id)
    )
      return null;
    return { createdAt, source: stream, id };
  } catch {
    return null;
  }
}
export function olderChannelRows(
  cursor: ChannelCursor | null,
  stream: 'm' | 'v',
  prefix: '' | 'v.' = '',
) {
  if (!cursor) return { sql: '', values: [] as string[] };
  const date = prefix + 'created_at',
    id = prefix + 'id';
  if (stream === cursor.source)
    return {
      sql: ` AND (${date} < ? OR (${date} = ? AND ${id} < ?))`,
      values: [cursor.createdAt, cursor.createdAt, cursor.id],
    };
  return {
    sql: ` AND ${date} ${stream < cursor.source ? '<=' : '<'} ?`,
    values: [cursor.createdAt],
  };
}
