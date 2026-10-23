export type YouTubePlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(n: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
};
type Options = {
  videoId: string;
  host: string;
  playerVars: Record<string, string | number>;
  events: {
    onReady: (e: { target: YouTubePlayer }) => void;
    onStateChange: (e: { data: number }) => void;
    onError: () => void;
    onAutoplayBlocked: () => void;
  };
};
type Api = { Player: new (element: HTMLElement, options: Options) => YouTubePlayer };
declare global {
  interface Window {
    YT?: Api;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let pending: Promise<Api> | null = null;
export function loadYouTubeApi(): Promise<Api> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pending) return pending;
  pending = new Promise<Api>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    const timeout = setTimeout(() => {
      pending = null;
      script.remove();
      reject(Error('YouTube player timed out'));
    }, 20000);
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      clearTimeout(timeout);
      if (window.YT?.Player) resolve(window.YT);
      else {
        pending = null;
        reject(Error('YouTube player unavailable'));
      }
    };
    script.onerror = () => {
      clearTimeout(timeout);
      pending = null;
      script.remove();
      reject(Error('YouTube player unavailable'));
    };
    document.head.appendChild(script);
  });
  return pending;
}
