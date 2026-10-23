import test from 'node:test';
import assert from 'node:assert/strict';
import { adminQuery, pageInfo } from '../lib/admin-query.ts';
test('review pagination validates filter and independent page positions', () => {
  const q = adminQuery('https://localhost/api/admin?status=pending&voicePage=2&messagePage=1');
  assert.equal(q.status, 'pending');
  assert.equal(q.voices, 2);
  assert.equal(q.messages, 1);
  assert.equal(q.reports, 0);
  for (const suffix of [
    'status=anything',
    'voicePage=-1',
    'voicePage=1.2',
    'reportPage=100000',
    'messagePage=hello',
  ])
    assert.throws(() => adminQuery('https://localhost/api/admin?' + suffix));
  assert.equal(pageInfo(0, 21, 20).hasNext, true);
  assert.equal(pageInfo(1, 21, 20).hasNext, false);
});
