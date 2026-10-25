import type { YouTubePlayer } from './youtube-player.ts';

// The iframe SDK can throw synchronously after its iframe has been removed.
// Forget only that controller so switching recordings is never interrupted.
export function videoCommand<T>(
  reference: { current: YouTubePlayer | null },
  command: (player: YouTubePlayer) => T,
): T | undefined {
  const player = reference.current;
  if (!player) return undefined;
  try {
    return command(player);
  } catch {
    if (reference.current === player) reference.current = null;
    try {
      player.destroy();
    } catch {}
    return undefined;
  }
}
