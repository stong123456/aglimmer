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
export const DEMOS: Voice[] = [
  {
    id: 'demo-slow',
    title: '慢一点，也是在向前走',
    signature: '小满 · 示例',
    recordedAt: '2026-10-12',
    createdAt: '2026-10-12T00:00:00Z',
    mood: '有点累',
    transcript:
      '如果今天有点累，就先停一停吧。你不需要把每一天都过得很厉害。喝一点水，看看窗外，给自己一点时间。慢一点，也是在向前走。愿你今晚，好好休息。',
    duration: 16.274285714285714,
    visibility: 'public',
    status: 'approved',
    featured: 1,
    futureYear: null,
    parentId: null,
    hearts: 0,
    saved: false,
    loved: false,
    demo: true,
    audioUrl: '/audio/warm-female.mp3',
    voiceStyle: '温柔女声',
    source: '原创示例文案 · HeyGen AI 情感朗读',
  },
  {
    id: 'demo-start',
    title: '重新开始，没有太晚',
    signature: '阿禾 · 示例',
    recordedAt: '2026-10-11',
    createdAt: '2026-10-11T00:00:00Z',
    mood: '重新开始',
    transcript:
      '重新开始的时候，害怕是很正常的。不必一下子看清整条路，先走好今天的一小步就可以。去学一点东西，发出那封邮件，或者给自己一个新的机会。你可以按照自己的节奏，慢慢来。',
    duration: 16.61387755102041,
    visibility: 'public',
    status: 'approved',
    featured: 1,
    futureYear: null,
    parentId: null,
    hearts: 0,
    saved: false,
    loved: false,
    demo: true,
    audioUrl: '/audio/grounded-male.mp3',
    voiceStyle: '沉稳男声',
    source: '原创示例文案 · HeyGen AI 情感朗读',
  },
  {
    id: 'demo-care',
    title: '今天，先照顾好自己',
    signature: '林间 · 示例',
    recordedAt: '2026-10-09',
    createdAt: '2026-10-09T00:00:00Z',
    mood: '需要勇气',
    transcript:
      '这段话送给总是在照顾别人的你。你的感受也值得被认真对待。今天可以少做一点，可以说一句我需要休息。给自己做一顿喜欢的饭吧。照顾好自己，也是很勇敢的一件事。',
    duration: 15.281632653061225,
    visibility: 'public',
    status: 'approved',
    featured: 1,
    futureYear: null,
    parentId: null,
    hearts: 0,
    saved: false,
    loved: false,
    demo: true,
    audioUrl: '/audio/bright-young.mp3',
    voiceStyle: '清亮少年声',
    source: '原创示例文案 · HeyGen AI 情感朗读',
  },
  {
    id: 'demo-future',
    title: '愿你还记得，今天的愿望',
    signature: '远山 · 示例',
    recordedAt: '2026-10-12',
    createdAt: '2026-10-12T00:00:00Z',
    mood: '给未来的我',
    transcript:
      '你好，十年后的我。今天我还在努力寻找自己的方向。我希望你没有忘记，那些让你开心的小事。不管你现在在哪里，都请替今天的我，看看天空，认真吃饭。愿你仍然愿意相信，生活里还有一点光。',
    duration: 20.114285714285714,
    visibility: 'public',
    status: 'approved',
    featured: 0,
    futureYear: 2036,
    parentId: null,
    hearts: 0,
    saved: false,
    loved: false,
    demo: true,
    audioUrl: '/audio/future-female.mp3',
    voiceStyle: '温柔女声',
    source: '原创示例文案 · HeyGen AI 情感朗读',
  },
];
export function dateLabel(date: string) {
  return date.slice(0, 10).replaceAll('-', '.');
}
export function durationLabel(n: number) {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
}
