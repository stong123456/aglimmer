import test from 'node:test';
import assert from 'node:assert/strict';
import { makeZip } from '../lib/zip.ts';
import { webmDuration } from '../lib/audio-duration.ts';
test('ZIP stores Unicode filenames and original bytes', async () => {
  const payload = new TextEncoder().encode('2026-10-12 · 当年的署名');
  const zip = makeZip([{ name: '署名与时间.json', data: payload }]);
  const bytes = new Uint8Array(await zip.arrayBuffer()),
    v = new DataView(bytes.buffer);
  assert.equal(v.getUint32(0, true), 0x04034b50);
  assert.equal(v.getUint16(6, true), 0x800);
  const length = v.getUint16(26, true);
  assert.equal(new TextDecoder().decode(bytes.slice(30, 30 + length)), '署名与时间.json');
  assert.deepEqual(bytes.slice(30 + length, 30 + length + payload.length), payload);
  assert.equal(v.getUint32(bytes.length - 22, true), 0x06054b50);
});
test('bounded WebM parser handles malformed data without accepting it', () => {
  assert.equal(webmDuration(new Uint8Array()), 0);
  assert.equal(webmDuration(new Uint8Array([0, 255, 255])), 0);
});
test('WebM block duration is measured independently of client metadata', () => {
  const bytes = new Uint8Array([
    0x18, 0x53, 0x80, 0x67, 0xff, 0x1f, 0x43, 0xb6, 0x75, 0x8b, 0xe7, 0x82, 0x03, 0xe8, 0xa3, 0x85,
    0x81, 0x07, 0xd0, 0x80, 0,
  ]);
  assert.equal(webmDuration(bytes), 3.04);
});

import { audioMime } from '../lib/audio-file.ts';
import { readFile } from 'node:fs/promises';
test('browser video/webm and empty M4A MIME labels normalize to audio', () => {
  assert.equal(audioMime('voice.webm', 'video/webm'), 'audio/webm');
  assert.equal(audioMime('voice.m4a', ''), 'audio/mp4');
  assert.equal(audioMime('document.html', 'text/html'), '');
});
test('real browser MediaRecorder WebM without Duration has measurable timecodes', async () => {
  const bytes = new Uint8Array(
    await readFile(new URL('./fixtures/recorder-tone.webm', import.meta.url)),
  );
  const duration = webmDuration(bytes);
  assert.ok(duration > 2 && duration < 4);
});
import { blockedReason, validImage } from '../lib/moderation.ts';
import { getTopic, TOPICS } from '../lib/topics.ts';
test('moderation permits tiredness and encouragement but blocks directed abuse', () => {
  assert.equal(blockedReason('我最近有点累，但是我不是废物，想重新开始。'), null);
  assert.ok(blockedReason('你就是废物'));
  assert.ok(blockedReason('你 就 是 废 物'));
  assert.ok(blockedReason('不如去死'));
});
test('channel definitions include casual and personality discussion', () => {
  assert.equal(TOPICS.length, 7);
  assert.ok(getTopic('casual'));
  assert.ok(getTopic('infp'));
  assert.equal(getTopic('nonexistent'), undefined);
});
test('image gate rejects SVG and invalid contents', () => {
  assert.equal(validImage(new TextEncoder().encode('<svg/>'), 'image/svg+xml'), false);
  assert.equal(validImage(new TextEncoder().encode('not png'), 'image/png'), false);
});
