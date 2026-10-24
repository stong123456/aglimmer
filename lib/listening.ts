import type { ClassicQuote } from './quotes';
import type { Voice } from './shared';
export type ListeningItem = {
  id: string;
  title: string;
  titleEn: string;
  author: string;
  authorEn: string;
  reader?: string;
  readerEn?: string;
  duration: number;
  sourceUrl: string;
  provider: 'audio' | 'youtube';
  audioUrl?: string;
  videoId?: string;
  catalogId?: string;
  gain?: number;
};
export function sourceAudioUrl(q: ClassicQuote): string {
  if (q.media.provider !== 'archive' || !q.media.collection || !q.media.file)
    throw Error('This source does not offer an audio stream');
  return `https://archive.org/download/${encodeURIComponent(q.media.collection)}/${encodeURIComponent(q.media.file)}`;
}
export function classicListeningItem(q: ClassicQuote): ListeningItem {
  return {
    id: 'classic:' + q.id,
    gain: 1,
    catalogId: q.id,
    title: q.work,
    titleEn: q.workEn,
    author: q.author,
    authorEn: q.authorEn,
    reader: q.media.credit,
    readerEn: q.media.creditEn,
    duration: q.media.duration ?? 0,
    sourceUrl: q.sourceUrl,
    provider: q.media.provider === 'youtube' ? 'youtube' : 'audio',
    ...(q.media.provider === 'youtube'
      ? { videoId: q.media.videoId }
      : { audioUrl: sourceAudioUrl(q) }),
  };
}
export function voiceListeningItem(v: Voice): ListeningItem {
  return {
    id: v.id,
    title: v.title,
    titleEn: v.title,
    author: v.signature,
    authorEn: v.signature,
    duration: v.duration,
    sourceUrl: '/?voice=' + encodeURIComponent(v.id),
    provider: 'audio',
    audioUrl: v.audioUrl,
  };
}
export function uniqueQueue(items: ListeningItem[]): ListeningItem[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
}
// One decision path for every provider: deadlines and requested endpoints win over autoplay.
export function afterListeningEnd(
  queue: ListeningItem[],
  currentId: string,
  {
    autoNext,
    stopAfterId,
    deadline,
    now,
  }: { autoNext: boolean; stopAfterId: string; deadline: number; now: number },
): { nextId: string | null; reason: 'timer' | 'target' | 'single' | 'complete' | 'next' } {
  if (deadline > 0 && now >= deadline) return { nextId: null, reason: 'timer' };
  const index = queue.findIndex((i) => i.id === currentId),
    target = queue.findIndex((i) => i.id === stopAfterId);
  if (index < 0) return { nextId: null, reason: 'complete' };
  if (target >= 0 && index >= target) return { nextId: null, reason: 'target' };
  if (!autoNext) return { nextId: null, reason: 'single' };
  const next = queue[index + 1];
  return next ? { nextId: next.id, reason: 'next' } : { nextId: null, reason: 'complete' };
}
export function sleepDeadline(minutes: number, now: number): number {
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 240 ? now + minutes * 60000 : 0;
}
export function remainingSleepSeconds(deadline: number, now: number): number {
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
}
