import test from 'node:test';
import assert from 'node:assert/strict';
import { podcastChapters, resumePosition } from '../lib/podcast.ts';
test('podcast chapters accept plain timestamps, sort and exclude invalid times', () => {
  const text =
    '[02:15] 小小的灯火\n[00:00] 故事开场\n[01:00:00] 太远\n[00:75] 错误秒数\n普通段落\n[04:00] 已经结束';
  assert.deepEqual(podcastChapters(text, 240), [
    { seconds: 0, title: '故事开场' },
    { seconds: 135, title: '小小的灯火' },
  ]);
  assert.deepEqual(podcastChapters('[00:01] 标题', NaN), []);
  assert.deepEqual(podcastChapters('[00:01]    ', 100), []);
});
test('podcast chapter list bounds and deduplicates timestamp navigation', () => {
  const lines = Array.from(
    { length: 40 },
    (_, i) => `[00:${String(i).padStart(2, '0')}] 第 ${i} 章`,
  ).join('\n');
  assert.equal(podcastChapters(lines, 100).length, 30);
  assert.deepEqual(podcastChapters('[00:01] 第一版\n[00:01] 更正标题', 100), [
    { seconds: 1, title: '更正标题' },
  ]);
});
test('resume progress ignores corruption, negative and near-completed positions', () => {
  assert.equal(resumePosition('12.5', 100), 12.5);
  for (const value of [null, 'NaN', 'Infinity', '-2', '96', '120'])
    assert.equal(resumePosition(value, 100), 0);
  assert.equal(resumePosition('5', NaN), 0);
});
