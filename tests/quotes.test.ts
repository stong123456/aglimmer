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
    assert.match(q.rights.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
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

import { WITHDRAWN_CLASSIC_IDS } from '../lib/quotes.ts';
import { OFFICIAL_SOURCES, SOURCE_TOPICS } from '../lib/official-sources.ts';
import { sourceRecord } from '../lib/source-registry.ts';
import {
  catalogPage,
  matchesShelf,
  librarySummary,
  isBedtimeRecording,
} from '../lib/library-discovery.ts';
test('expanded discovery keeps official programme links distinct from playable recordings', () => {
  const active = CLASSIC_QUOTES.filter((q) => !WITHDRAWN_CLASSIC_IDS.includes(q.id));
  assert.ok(active.length >= 878);
  assert.ok(librarySummary(active).books >= 30);
  assert.ok(OFFICIAL_SOURCES.length >= 20);
  const ids = [...active, ...OFFICIAL_SOURCES].map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of OFFICIAL_SOURCES) {
    assert.equal(s.accessMode, 'official-link');
    assert.equal(new URL(s.url).protocol, 'https:');
    assert.equal(new URL(s.rightsUrl).protocol, 'https:');
    assert.ok(s.title && s.publisher && s.description && s.descriptionEn && s.note && s.noteEn);
    assert.ok(!('media' in s));
    assert.ok(s.topics.every((t) => SOURCE_TOPICS.some((x) => x.id === t)));
    assert.equal(sourceRecord(s.id)?.retired, false);
  }
  assert.equal(sourceRecord('clouds')?.retired, true);
  assert.equal(sourceRecord('not-a-source'), undefined);
  assert.ok(active.some((q) => matchesShelf(q, 'nature')));
  assert.ok(active.some((q) => matchesShelf(q, 'chinese')));
  assert.ok(active.some((q) => matchesShelf(q, 'stories')));
  assert.ok(
    active
      .filter(isBedtimeRecording)
      .every((q) => q.media.provider === 'archive' && q.sleepSuitable === true),
  );
  assert.equal(
    isBedtimeRecording({ ...active[0], theme: 'rest', sleepSuitable: undefined }),
    false,
  );
});
test('deep links pin a distant chapter without mounting the entire catalog', () => {
  const target = CLASSIC_QUOTES[CLASSIC_QUOTES.length - 1];
  const page = catalogPage(CLASSIC_QUOTES, 12, target.id);
  assert.equal(page[0].id, target.id);
  assert.equal(page.length, 13);
  assert.equal(catalogPage(CLASSIC_QUOTES, 12, CLASSIC_QUOTES[0].id).length, 12);
  assert.equal(catalogPage([], 12, target.id).length, 0);
  assert.equal(catalogPage(CLASSIC_QUOTES, 12, 'unknown').length, 12);
});
