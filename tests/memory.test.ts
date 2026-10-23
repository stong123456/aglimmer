import test from 'node:test';
import assert from 'node:assert/strict';
import { annualMemories, memoryCalendar, nextMemoryDate } from '../lib/memory.ts';
import { type Voice } from '../lib/shared.ts';

const now = new Date('2026-10-23T08:00:00Z');
test('memory reminders choose the next anniversary and handle leap days without shifting into March', () => {
  assert.equal(nextMemoryDate('2020-10-23', '2026-10-23'), '2027-10-23');
  assert.equal(nextMemoryDate('2024-02-29', '2026-01-01'), '2026-02-28');
  assert.equal(nextMemoryDate('2024-02-29', '2026-10-23', 2044), '2044-02-29');
  assert.equal(nextMemoryDate('2024-02-29', '2026-10-23', 2036), '2036-02-29');
});
test('calendar exports are valid bounded all-day events with opt-in recurrence and no private recording URL', () => {
  const text = memoryCalendar({ date: '2036-10-23', annual: true, locale: 'zh', now });
  assert.ok(text.includes('DTSTART;VALUE=DATE:20361023\r\n'));
  assert.ok(text.includes('DTEND;VALUE=DATE:20361024\r\n'));
  assert.ok(text.includes('RRULE:FREQ=YEARLY\r\n'));
  assert.ok(text.includes('URL:https://aglimmer.xyz/?view=archive\r\n'));
  assert.ok(!text.includes('/api/voices/'));
  assert.ok(
    !memoryCalendar({ date: '2036-10-23', annual: false, locale: 'en', now }).includes('RRULE:'),
  );
  for (const date of ['2026-02-30', '2025-10-23', '2200-01-01', 'bad'])
    assert.throws(() => memoryCalendar({ date, annual: false, locale: 'zh', now }));
});
test('calendar text cannot inject properties and UTF-8 lines respect the 75-octet limit', () => {
  const text = memoryCalendar({
    date: '2027-01-01',
    annual: false,
    locale: 'zh',
    now,
    title: '温柔的声音'.repeat(40) + '\r\nATTENDEE:evil@example.test',
    signature: 'a,b;c\\d',
  });
  assert.ok(!text.includes('\r\nATTENDEE:'));
  for (const line of text.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  const unfolded = text.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('\\nATTENDEE:evil@example.test'));
  assert.ok(unfolded.includes('a\\,b\\;c\\\\d'));
});
test('annual recaps use authored recording dates, exclude samples and preserve the original collection', () => {
  const make = (id: string, recordedAt: string, duration: number): Voice =>
    ({
      id,
      recordedAt,
      duration,
      createdAt: recordedAt + 'T00:00:00Z',
      futureYear: null,
      demo: false,
    }) as Voice;
  const voices = [
    make('late', '2026-12-31', 12),
    make('early', '2026-01-01', 3),
    make('same', '2026-01-01', 7),
    make('old', '2025-12-31', 50),
    { id: 'demo', demo: true, recordedAt: '2026-01-01', duration: 90 } as Voice,
  ];
  const before = voices.map((v) => v.id);
  const recap = annualMemories(voices, '2026');
  assert.equal(recap.entries.length, 3);
  assert.equal(recap.days, 2);
  assert.equal(recap.seconds, 22);
  assert.equal(recap.entries[0].id, 'early');
  assert.equal(recap.entries.at(-1)?.id, 'late');
  assert.deepEqual(
    voices.map((v) => v.id),
    before,
  );
  assert.equal(annualMemories(voices, '2030').entries.length, 0);
});
