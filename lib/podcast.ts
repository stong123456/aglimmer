export type Chapter = { seconds: number; title: string };
// Chapters are optional plain-text lines such as [02:15] A small discovery.
export function podcastChapters(text: string, duration: number): Chapter[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const found = new Map<number, Chapter>();
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*\[(?:(\d{1,2}):)?(\d{1,3}):(\d{2})\]\s*(.{1,80})\s*$/);
    if (!match) continue;
    const hours = Number(match[1] || 0),
      minutes = Number(match[2]),
      seconds = Number(match[3]);
    if (seconds >= 60 || (match[1] && minutes >= 60)) continue;
    const time = hours * 3600 + minutes * 60 + seconds;
    if (time >= duration || !match[4].trim()) continue;
    found.set(time, { seconds: time, title: match[4].trim() });
    if (found.size >= 30) break;
  }
  return [...found.values()].sort((a, b) => a.seconds - b.seconds);
}
export function resumePosition(value: string | null, duration: number): number {
  const time = Number(value);
  return Number.isFinite(time) && Number.isFinite(duration) && time > 0 && time < duration - 5
    ? time
    : 0;
}
