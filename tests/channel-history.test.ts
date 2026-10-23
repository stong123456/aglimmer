import test from 'node:test';
import assert from 'node:assert/strict';
import {
  channelMessageKey,
  compareChannelMessages,
  encodeChannelCursor,
  mergeChannelMessages,
  parseChannelCursor,
} from '../lib/channel-history.ts';
import type { ChannelMessage } from '../lib/moderation.ts';
const at = '2026-10-23T00:00:00.000Z';
const message = (id: string, kind: ChannelMessage['kind'] = 'text'): ChannelMessage => ({
  id,
  kind,
  createdAt: at,
  body: id,
  signature: '测试',
  status: 'approved',
  mine: false,
});
test('mixed channel history has a deterministic binary order, including colliding IDs', () => {
  const items = [message('a_', 'voice'), message('a_'), message('a-')].sort(compareChannelMessages);
  assert.deepEqual(items.map(channelMessageKey), ['m:a-', 'm:a_', 'v:a_']);
  const merged = mergeChannelMessages(items, [{ ...message('a_'), body: 'current snapshot' }]);
  assert.equal(merged.length, 3);
  assert.equal(merged[1].body, 'current snapshot');
});
test('history cursor round trips and rejects malformed or unbounded positions', () => {
  const cursor = encodeChannelCursor(message('one', 'voice'));
  assert.deepEqual(parseChannelCursor(cursor), { createdAt: at, source: 'v', id: 'one' });
  assert.equal(
    parseChannelCursor(
      encodeChannelCursor({ ...message('old'), createdAt: '2026-10-23T00:00:00Z' }),
    )?.createdAt,
    '2026-10-23T00:00:00Z',
  );
  for (const bad of [
    '',
    '%%%bad',
    'a'.repeat(513),
    btoa('["not-a-date","v","one"]'),
    btoa(JSON.stringify([at, 'private', 'one'])),
  ])
    assert.equal(parseChannelCursor(bad), null);
});
