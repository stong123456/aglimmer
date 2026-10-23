import catalog from './classic-catalog.json' with { type: 'json' };
import extra from './classic-catalog-extra.json' with { type: 'json' };
import chineseLong from './classic-catalog-chinese-long.json' with { type: 'json' };
import { QUOTE_THEMES } from './quote-themes.ts';
export { QUOTE_THEMES } from './quote-themes.ts';
export type ClassicQuote = {
  id: string;
  theme: (typeof QUOTE_THEMES)[number]['id'];
  zh: string;
  en: string;
  originalLanguage: 'zh' | 'en';
  author: string;
  authorEn: string;
  work: string;
  workEn: string;
  period: string;
  sourceUrl: string;
  context: string;
  kind: 'poetry' | 'speech' | 'film' | 'story';
  series?: string;
  seriesEn?: string;
  sleepSuitable?: boolean;
  media: {
    provider: 'archive' | 'youtube';
    collection?: string;
    file?: string;
    duration?: number;
    videoId?: string;
    credit: string;
    creditEn: string;
    verifiedTitle?: string;
  };
  rights: {
    status: 'source-embed' | 'official-embed';
    checkedAt: string;
    licenseUrl: string;
    basis: string;
    basisEn: string;
  };
};
export const CLASSIC_QUOTES = [...catalog, ...extra, ...chineseLong] as ClassicQuote[];
// Player URLs are composed only from the reviewed catalog, never from user input.
export function classicEmbedUrl(q: ClassicQuote): string {
  if (q.media.provider === 'youtube')
    return `https://www.youtube-nocookie.com/embed/${q.media.videoId}?autoplay=0&cc_load_policy=1&cc_lang_pref=zh-Hans&rel=0`;
  return `https://archive.org/embed/${encodeURIComponent(q.media.collection!)}/${encodeURIComponent(q.media.file!)}?autoplay=0`;
}
