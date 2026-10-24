import test from 'node:test';
import assert from 'node:assert/strict';
import { seal, unseal, sha256, safeRestoreRows } from '../lib/maintenance-crypto.ts';
import { CLASSIC_QUOTES, WITHDRAWN_CLASSIC_IDS } from '../lib/quotes.ts';
import {
  QUIET_ZH_IDS,
  quietChinese,
  orderedSelection,
  COURAGE_IDS,
  LONG_STORY_IDS,
  firstListenSelection,
} from '../lib/curation.ts';
test('backup encryption authenticates bytes, key and object context', async () => {
  const bytes = new TextEncoder().encode('署名 / 2020-10-12 / original bytes'),
    key = 'ab'.repeat(32),
    cipher = await seal(bytes, key, 'one');
  assert.deepEqual(await unseal(cipher, key, 'one'), bytes);
  assert.notEqual(await sha256(cipher), await sha256(bytes));
  await assert.rejects(unseal(cipher, key, 'other'));
  await assert.rejects(unseal(cipher, 'cd'.repeat(32), 'one'));
  cipher[13] ^= 1;
  await assert.rejects(unseal(cipher, key, 'one'));
});
test('restore excludes deleted accounts and recordings and never republishes historical permissions', () => {
  const tables = {
    profiles: [{ id: 'a', avatar_key: 'old-avatar' }, { id: 'b' }],
    voices: [
      {
        id: 'v1',
        owner_id: 'a',
        audio_key: 'one',
        signature: 'Original name',
        recorded_at: '2020-10-12',
        visibility: 'public',
        status: 'approved',
        featured: 1,
        parent_id: 'v2',
      },
      { id: 'v2', owner_id: 'a', audio_key: 'two' },
      { id: 'v3', owner_id: 'b', audio_key: 'three' },
    ],
    messages: [{ id: 'm', owner_id: 'b' }],
    reactions: [{ user_id: 'b', voice_id: 'v1' }],
    auth_identities: [{ user_id: 'a' }, { user_id: 'b' }],
  };
  const x = safeRestoreRows(tables, [
    { kind: 'voice', resource_id: 'v2', key: 'two' },
    { kind: 'account', resource_id: 'b', key: 'account:b' },
    { kind: 'avatar', resource_id: 'a', key: 'old-avatar' },
  ]);
  assert.equal(x.voices.length, 1);
  assert.equal(x.voices[0].visibility, 'private');
  assert.equal(x.voices[0].status, 'private');
  assert.equal(x.voices[0].signature, 'Original name');
  assert.equal(x.voices[0].recorded_at, '2020-10-12');
  assert.equal(x.voices[0].parent_id, null);
  assert.equal(x.profiles[0].avatar_key, null);
  assert.equal(x.auth_identities.length, 1);
  assert.equal(x.reactions.length, 0);
  assert.equal(x.messages.length, 0);
});
test('first listen and homepage use Chinese prose, never withdrawn poetry or duplicated previews', () => {
  const chinese = quietChinese(CLASSIC_QUOTES);
  assert.equal(chinese.length, 3);
  assert.equal(new Set(QUIET_ZH_IDS).size, 3);
  assert.ok(chinese.every((q) => q.originalLanguage === 'zh' && q.kind === 'story'));
  assert.equal(chinese[0].id, 'lv-zh-prose-gesheng');
  assert.equal(WITHDRAWN_CLASSIC_IDS.length, 320);
  assert.ok(WITHDRAWN_CLASSIC_IDS.includes('clouds'));
  const previews = [
    chinese,
    orderedSelection(CLASSIC_QUOTES, COURAGE_IDS),
    orderedSelection(CLASSIC_QUOTES, LONG_STORY_IDS),
  ].flatMap((l) => l.slice(0, 3).map((q) => q.id));
  assert.equal(new Set(previews).size, 9);
  assert.ok(previews.every((id) => !WITHDRAWN_CLASSIC_IDS.includes(id)));
  for (const mood of ['', '有点累', '需要勇气', '重新开始', '给未来的我']) {
    assert.ok(
      firstListenSelection(CLASSIC_QUOTES, mood).every(
        (q) => q.kind === 'story' && q.originalLanguage === 'zh',
      ),
    );
  }
  assert.equal(
    quietChinese(CLASSIC_QUOTES.filter((q) => q.id !== 'lv-zh-prose-gesheng')).length,
    2,
  );
  assert.deepEqual(
    firstListenSelection(CLASSIC_QUOTES.filter((q) => WITHDRAWN_CLASSIC_IDS.includes(q.id))),
    [],
  );
  assert.deepEqual(firstListenSelection([]), []);
});
