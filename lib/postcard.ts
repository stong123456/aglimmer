import type { Voice } from './shared';
export function canMakePostcard(v: Pick<Voice, 'visibility' | 'status'>) {
  return v.visibility === 'public' && v.status === 'approved';
}
export function postcardQuote(title: string, transcript: string) {
  return (
    transcript
      .split(/[。！？\n]/)
      .map((s) => s.trim())
      .find(Boolean) || title
  ).slice(0, 90);
}
