import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSIC_QUOTES, QUOTE_THEMES, classicEmbedUrl } from '../lib/quotes.ts';
test('reviewed source collection has a large deduplicated catalog across five themes', () => {
  assert.ok(CLASSIC_QUOTES.length >= 700);
  assert.equal(new Set(CLASSIC_QUOTES.map((q) => q.id)).size, CLASSIC_QUOTES.length);
  assert.equal(
    new Set(CLASSIC_QUOTES.map((q) => q.sourceUrl + '#' + (q.media.file ?? ''))).size,
    CLASSIC_QUOTES.length,
  );
  assert.equal(new Set(CLASSIC_QUOTES.map((q) => q.theme)).size, QUOTE_THEMES.length);
  assert.ok(CLASSIC_QUOTES.filter((q) => q.kind === 'poetry').length >= 320);
  assert.ok(CLASSIC_QUOTES.filter((q) => q.kind === 'story').length >= 400);
  assert.equal(CLASSIC_QUOTES.filter((q) => q.kind === 'speech').length, 14);
  for (const q of CLASSIC_QUOTES) {
    assert.ok(q.zh && q.en && q.author && q.work && q.media.credit && q.rights.basis);
    assert.match(q.rights.checkedAt, /^2026-10-2[34]$/);
    assert.equal(new URL(q.sourceUrl).protocol, 'https:');
    const player = new URL(classicEmbedUrl(q));
    assert.ok(['archive.org', 'www.youtube-nocookie.com'].includes(player.hostname));
    assert.equal(player.searchParams.get('autoplay'), '0');
    if (q.media.provider === 'archive') {
      assert.ok(q.media.duration! > 0);
      assert.ok(q.media.collection && q.media.file?.endsWith('.mp3'));
      assert.ok(q.rights.basisEn.includes('USA'));
    } else {
      assert.match(q.media.videoId!, /^[a-zA-Z0-9_-]{11}$/);
      assert.equal(q.rights.status, 'official-embed');
    }
  }
});
