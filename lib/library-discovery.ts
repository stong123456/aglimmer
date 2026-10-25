import type { ClassicQuote } from './quotes.ts';
export const LIBRARY_SHELVES = [
  { id: 'all', zh: '全部原声', en: 'All recordings' },
  { id: 'chinese', zh: '中文故事与散文', en: 'Chinese stories & essays' },
  { id: 'life', zh: '中文生活微纪录', en: 'Chinese life stories' },
  { id: 'nature', zh: '自然与远方', en: 'Nature & journeys' },
  { id: 'stories', zh: '英文故事书', en: 'English storybooks' },
  { id: 'bedtime', zh: '睡前小书架', en: 'Bedtime shelf' },
] as const;
export function isBedtimeRecording(q: ClassicQuote) {
  return q.media.provider === 'archive' && q.sleepSuitable === true;
}
export function matchesShelf(q: ClassicQuote, shelf: string): boolean {
  if (shelf === 'chinese')
    return q.originalLanguage === 'zh' && q.kind === 'story' && q.media.provider === 'archive';
  if (shelf === 'life')
    return q.originalLanguage === 'zh' && q.media.provider === 'youtube' && q.kind === 'story';
  if (shelf === 'nature')
    return (
      q.originalLanguage === 'en' &&
      q.kind === 'story' &&
      /Muir|Thoreau|Burroughs|Jefferies|Gilbert White/i.test(q.authorEn)
    );
  if (shelf === 'stories')
    return q.originalLanguage === 'en' && q.kind === 'story' && !matchesShelf(q, 'nature');
  if (shelf === 'bedtime') return isBedtimeRecording(q);
  return true;
}
export function catalogPage(values: ClassicQuote[], limit: number, linkedId: string) {
  const page = values.slice(0, limit),
    linked = values.find((q) => q.id === linkedId);
  return linked && !page.some((q) => q.id === linkedId) ? [linked, ...page] : page;
}
export function librarySummary(values: ClassicQuote[]) {
  return {
    items: values.length,
    hours: Math.round(values.reduce((n, q) => n + (q.media.duration ?? 0), 0) / 3600),
    books: new Set(
      values.filter((q) => q.series && q.media.provider === 'archive').map((q) => q.series),
    ).size,
    chinese: values.filter((q) => q.originalLanguage === 'zh').length,
  };
}

export function discoveryOrder(values: ClassicQuote[]) {
  const ids = [
    'yit-family-creating-together',
    'lv-zh-prose-gesheng',
    'enx-potter-003',
    'yit-painting-after-retirement',
    'lv-zh-prose-congcong',
    'enx-yosemite-010',
    'yit-botanical-painter',
    'lv-zh-small-incident',
    'enx-yosemite-016',
    'jobs',
    'grit',
    'lv-zh-village-opera',
  ];
  const map = new Map(values.map((q) => [q.id, q]));
  return [
    ...ids.map((id) => map.get(id)).filter((q): q is ClassicQuote => !!q),
    ...values.filter((q) => !ids.includes(q.id)),
  ];
}
