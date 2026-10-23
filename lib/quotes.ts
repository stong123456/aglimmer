import catalog from './classic-catalog.json' with { type: 'json' };
export const QUOTE_THEMES = [
  { id: 'rest', label: '慢一点也没关系', labelEn: 'Room to rest', mood: '有点累' },
  { id: 'courage', label: '借一点勇气', labelEn: 'A little courage', mood: '需要勇气' },
  { id: 'begin', label: '重新出发', labelEn: 'Begin again', mood: '重新开始' },
  { id: 'hope', label: '给心留一束光', labelEn: 'Keep a little hope', mood: '给未来的我' },
  { id: 'connection', label: '有人与你共鸣', labelEn: 'Human connection', mood: '有点累' },
] as const;
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
  kind: 'poetry' | 'speech' | 'film';
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
export const CLASSIC_QUOTES = catalog as ClassicQuote[];
// Player URLs are composed only from the reviewed catalog, never from user input.
export function classicEmbedUrl(q: ClassicQuote): string {
  if (q.media.provider === 'youtube')
    return `https://www.youtube-nocookie.com/embed/${q.media.videoId}?autoplay=0&cc_load_policy=1&cc_lang_pref=zh-Hans&rel=0`;
  return `https://archive.org/embed/${encodeURIComponent(q.media.collection!)}/${encodeURIComponent(q.media.file!)}?autoplay=0`;
}
