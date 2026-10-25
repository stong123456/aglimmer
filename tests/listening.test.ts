import test from 'node:test';
import assert from 'node:assert/strict';
import {
  afterListeningEnd,
  classicListeningItem,
  sourceAudioUrl,
  sleepDeadline,
  remainingSleepSeconds,
  uniqueQueue,
  type ListeningItem,
} from '../lib/listening.ts';
import { CLASSIC_QUOTES } from '../lib/quotes.ts';
import { videoCommand } from '../lib/video-controller.ts';
import type { YouTubePlayer } from '../lib/youtube-player.ts';
test('a detached iframe cannot interrupt changing recordings, closing or progress checks', () => {
  const stale = new Proxy({} as YouTubePlayer, {
    get: () => () => {
      throw new TypeError("Cannot read properties of null (reading 'src')");
    },
  });
  for (const action of [
    (p: YouTubePlayer) => p.getCurrentTime(),
    (p: YouTubePlayer) => p.pauseVideo(),
    (p: YouTubePlayer) => p.getDuration(),
    (p: YouTubePlayer) => p.seekTo(3, true),
  ]) {
    const reference = { current: stale as YouTubePlayer | null };
    assert.equal(videoCommand(reference, action), undefined);
    assert.equal(reference.current, null);
    let called = false;
    videoCommand(reference, () => {
      called = true;
    });
    assert.equal(called, false);
  }
  const reference = { current: { getCurrentTime: () => 12 } as YouTubePlayer | null };
  assert.equal(
    videoCommand(reference, (p) => p.getCurrentTime()),
    12,
  );
  assert.ok(reference.current);
  const replacement = reference.current;
  reference.current = stale;
  videoCommand(reference, () => {
    reference.current = replacement;
    throw Error('Late failure');
  });
  assert.equal(reference.current, replacement);
});
const queue = ['one', 'two', 'three'].map((id) => ({ id }) as ListeningItem);
const settings = { autoNext: true, stopAfterId: '', deadline: 0, now: 1000 };
test('continuous playback advances once and stops at the queue boundary without looping', () => {
  assert.deepEqual(afterListeningEnd(queue, 'one', settings), { nextId: 'two', reason: 'next' });
  assert.deepEqual(afterListeningEnd(queue, 'three', settings), {
    nextId: null,
    reason: 'complete',
  });
  assert.equal(afterListeningEnd(queue, 'unknown', settings).nextId, null);
  assert.equal(afterListeningEnd(queue, 'one', { ...settings, autoNext: false }).reason, 'single');
});
test('the earlier sleep deadline or selected work stops automatic playback, including manual skips', () => {
  assert.deepEqual(afterListeningEnd(queue, 'one', { ...settings, stopAfterId: 'two' }), {
    nextId: 'two',
    reason: 'next',
  });
  assert.equal(
    afterListeningEnd(queue, 'two', { ...settings, stopAfterId: 'two' }).reason,
    'target',
  );
  assert.equal(
    afterListeningEnd(queue, 'three', { ...settings, stopAfterId: 'two' }).reason,
    'target',
  );
  assert.equal(
    afterListeningEnd(queue, 'one', { ...settings, deadline: 1000, stopAfterId: 'three' }).reason,
    'timer',
  );
  assert.equal(
    afterListeningEnd(queue, 'two', { ...settings, deadline: 1100, stopAfterId: 'two' }).reason,
    'target',
  );
  assert.equal(
    afterListeningEnd(queue, 'one', { ...settings, deadline: 999, autoNext: false }).reason,
    'timer',
  );
});
test('sleep timers bound custom values and compare absolute time after page suspension', () => {
  assert.equal(sleepDeadline(30, 1000), 1801000);
  assert.equal(sleepDeadline(240, 1000), 14401000);
  for (const n of [0, -1, 0.5, 241, Infinity, NaN]) assert.equal(sleepDeadline(n, 1000), 0);
  assert.equal(remainingSleepSeconds(61000, 1000), 60);
  assert.equal(remainingSleepSeconds(61000, 61001), 0);
  assert.equal(
    afterListeningEnd(queue, 'one', { ...settings, deadline: 61000, now: 1800000 }).reason,
    'timer',
  );
});
test('source adapters preserve origin streams, official video IDs and stable queue identity', () => {
  const audio = CLASSIC_QUOTES.find((q) => q.media.provider === 'archive')!,
    video = CLASSIC_QUOTES.find((q) => q.media.provider === 'youtube')!;
  const item = classicListeningItem(audio);
  assert.equal(item.provider, 'audio');
  assert.equal(new URL(item.audioUrl!).hostname, 'archive.org');
  assert.ok(item.audioUrl!.includes('/download/'));
  assert.equal(classicListeningItem(video).videoId, video.media.videoId);
  assert.throws(() => sourceAudioUrl(video));
  assert.deepEqual(
    uniqueQueue([queue[0], queue[1], queue[0]]).map((i) => i.id),
    ['one', 'two'],
  );
});
