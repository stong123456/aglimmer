import type { ClassicQuote } from './quotes';
// Explicit editorial choices; never fall back to the withdrawn poetry recordings.
export const QUIET_ZH_IDS = ['lv-zh-prose-gesheng', 'lv-zh-prose-congcong', 'lv-zh-small-incident'];
export const COURAGE_IDS = ['jobs', 'grit', 'growth', 'introverts', 'vulnerability', 'good-life'];
export const LONG_STORY_IDS = [
  'lv-zh-village-opera',
  'lv-zh-lake-storytelling',
  'lv-zh-herb-garden',
];
export function orderedSelection(values: ClassicQuote[], ids: readonly string[]) {
  const byId = new Map(values.map((q) => [q.id, q]));
  return ids.map((id) => byId.get(id)).filter((q): q is ClassicQuote => !!q);
}
export function quietChinese(values: ClassicQuote[]) {
  return orderedSelection(values, QUIET_ZH_IDS).filter(
    (q) => q.originalLanguage === 'zh' && q.kind === 'story' && q.media.provider === 'archive',
  );
}
export function firstListenSelection(values: ClassicQuote[], mood = '') {
  const themes: Record<string, string> = {
    有点累: 'rest',
    需要勇气: 'courage',
    重新开始: 'restart',
    给未来的我: 'hope',
  };
  const list = quietChinese(values),
    theme = themes[mood] ?? 'rest';
  return [...list.filter((q) => q.theme === theme), ...list.filter((q) => q.theme !== theme)].slice(
    0,
    12,
  );
}
