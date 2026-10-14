import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { translate } from '../lib/i18n.ts';
import { translateView } from '../lib/i18n-view.ts';
import { validAvatar } from '../lib/avatar.ts';
import { canMakePostcard, postcardQuote } from '../lib/postcard.ts';
test('bilingual views keep input values and server option values unchanged', () => {
  const tree = createElement(
    'div',
    null,
    createElement('select', null, createElement('option', null, '有点累')),
    createElement('input', { value: '声音墙', placeholder: '你的邮箱', readOnly: true }),
  );
  const html = renderToStaticMarkup(translateView(tree, 'en'));
  assert.ok(html.includes('value="有点累">Feeling tired'));
  assert.ok(html.includes('value="声音墙"'));
  assert.ok(html.includes('placeholder="Your email"'));
});
test('authored content stays verbatim even when it matches an interface phrase', () => {
  const html = renderToStaticMarkup(
    translateView(createElement('span', { 'data-original': true }, '声音墙'), 'en'),
  );
  assert.ok(html.includes('声音墙'));
  assert.equal(translate('声音墙', 'en'), 'Voice wall');
  assert.equal(translate('10 条公开留言', 'en'), '10 public posts');
});
test('avatar validation rejects SVG, malformed and oversized raster dimensions', () => {
  const png = Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf6kAAAAASUVORK5CYII=',
      'base64',
    ),
  );
  assert.equal(validAvatar(png, 'image/png'), true);
  assert.equal(validAvatar(new TextEncoder().encode('<svg/>'), 'image/svg+xml'), false);
  assert.equal(validAvatar(new Uint8Array(30), 'image/png'), false);
  const bad = png.slice();
  new DataView(bad.buffer).setUint32(16, 5000);
  assert.equal(validAvatar(bad, 'image/png'), false);
});
test('postcards cannot expose pending, rejected or private recordings', () => {
  for (const v of [
    { visibility: 'private', status: 'approved' },
    { visibility: 'public', status: 'pending' },
    { visibility: 'public', status: 'rejected' },
  ])
    assert.equal(canMakePostcard(v), false);
  assert.equal(canMakePostcard({ visibility: 'public', status: 'approved' }), true);
  assert.equal(postcardQuote('A title', '').length, 7);
  assert.equal(postcardQuote('Title', '第一句话。第二句话'), '第一句话');
});
