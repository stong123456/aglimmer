export const MOODS = ['有点累', '需要勇气', '重新开始', '给未来的我'] as const;
export type Voice = {
  id: string;
  title: string;
  signature: string;
  recordedAt: string;
  createdAt: string;
  mood: string;
  topic?: string | null;
  transcript: string;
  source: string;
  duration: number;
  size?: number;
  visibility: string;
  status: string;
  featured: number;
  futureYear: number | null;
  parentId: string | null;
  reviewNote?: string;
  hearts: number;
  saved: boolean;
  loved: boolean;
  demo?: boolean;
  voiceStyle?: string;
  audioUrl: string;
};
export const PROMPTS = [
  {
    title: '给低谷中的人',
    mood: '有点累',
    text: '我也经历过一段____的日子。那时帮到我的一件小事是____。今天，你可以先____。',
  },
  {
    title: '给未来的自己',
    mood: '给未来的我',
    text: '今天，我正在____。我最想记住的是____。十年后的你，还记得现在的愿望吗？',
  },
  {
    title: '记录一个小进步',
    mood: '需要勇气',
    text: '最近，我终于____。虽然只是很小的一步，但我想告诉你：____。',
  },
  {
    title: '给重新开始的人',
    mood: '重新开始',
    text: '我曾经害怕____。后来，我试着先做____。如果你也准备重新开始，我想说____。',
  },
  {
    title: '留下一句陪伴',
    mood: '有点累',
    text: '如果你今天觉得____，不用急着改变它。你可以____。我愿意陪你在这里停一会儿。',
  },
  {
    title: '写给一个普通的今天',
    mood: '需要勇气',
    text: '今天让我觉得生活还有一点光的，是____。也把这份小小的快乐，分享给正在听的你。',
  },
];
// Curated source recordings live in the separately attributed classic library.
export const DEMOS: Voice[] = [];
export function dateLabel(date: string) {
  return date.slice(0, 10).replaceAll('-', '.');
}
export function durationLabel(n: number) {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
}
