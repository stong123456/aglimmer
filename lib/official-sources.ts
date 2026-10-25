import sources from './official-listening-sources.json' with { type: 'json' };
export const SOURCE_TOPICS = [
  { id: 'story', zh: '故事', en: 'Stories' },
  { id: 'prose', zh: '阅读与散文', en: 'Books & essays' },
  { id: 'life', zh: '慢生活', en: 'Everyday life' },
  { id: 'nature', zh: '自然', en: 'Nature' },
  { id: 'culture', zh: '文化', en: 'Culture' },
  { id: 'growth', zh: '成长', en: 'Growth' },
] as const;
export type OfficialSource = {
  id: string;
  title: string;
  titleEn: string;
  publisher: string;
  publisherEn: string;
  language: 'zh';
  topics: string[];
  description: string;
  descriptionEn: string;
  url: string;
  accessMode: 'official-link';
  rightsUrl: string;
  checkedAt: string;
  note: string;
  noteEn: string;
};
export const OFFICIAL_SOURCES = sources as OfficialSource[];
