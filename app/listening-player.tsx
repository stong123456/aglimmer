'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Moon, Pause, Play, SkipBack, SkipForward, X, ListMusic, ExternalLink } from 'lucide-react';
import { useClassicSources } from './classic-sources';
import { usePreferences } from './preferences';
import {
  afterListeningEnd,
  remainingSleepSeconds,
  sleepDeadline,
  uniqueQueue,
  type ListeningItem,
} from '@/lib/listening';
import { durationLabel } from '@/lib/shared';
import { resumePosition } from '@/lib/podcast';
import type { YouTubePlayer } from '@/lib/youtube-player';
type StartOptions = { sleep?: boolean; minutes?: number };
type ListeningContext = {
  current: ListeningItem | null;
  playing: boolean;
  queue: ListeningItem[];
  start: (items: ListeningItem[], id?: string, options?: StartOptions) => void;
  toggle: () => void;
  openSleep: () => void;
};
const Context = createContext<ListeningContext | null>(null);
export function useListening() {
  const value = useContext(Context);
  if (!value) throw Error('Listening provider is missing');
  return value;
}
type VideoHandlers = {
  ready: (player: YouTubePlayer) => void;
  state: (state: number) => void;
  error: () => void;
  blocked: () => void;
};
function SourceVideo({ item, handlers }: { item: ListeningItem; handlers: VideoHandlers }) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    let cancelled = false,
      player: YouTubePlayer | null = null;
    const element = document.createElement('div');
    host.current?.appendChild(element);
    void import('@/lib/youtube-player')
      .then((m) => m.loadYouTubeApi())
      .then((api) => {
        if (cancelled) return;
        player = new api.Player(element, {
          host: 'https://www.youtube-nocookie.com',
          videoId: item.videoId!,
          playerVars: { autoplay: 0, playsinline: 1, origin: location.origin, rel: 0 },
          events: {
            onReady: (e) => {
              if (!cancelled) latest.current.ready(e.target);
            },
            onStateChange: (e) => {
              if (!cancelled) latest.current.state(e.data);
            },
            onError: () => {
              if (!cancelled) latest.current.error();
            },
            onAutoplayBlocked: () => {
              if (!cancelled) latest.current.blocked();
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) latest.current.error();
      });
    return () => {
      cancelled = true;
      player?.destroy();
      element.remove();
    };
  }, [item.id]);
  return <div className="listening-video" ref={host} />;
}
export function ListeningProvider({ children }: { children: ReactNode }) {
  const { hidden } = useClassicSources();
  const unavailable = useRef(new Set<string>());
  unavailable.current = new Set(hidden ?? []);
  const { locale } = usePreferences(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [queue, setQueue] = useState<ListeningItem[]>([]),
    [current, setCurrent] = useState<ListeningItem | null>(null),
    [playing, setPlaying] = useState(false),
    [full, setFull] = useState(false);
  const [autoNext, setAutoNext] = useState(true),
    [stopAfterId, setStopAfterId] = useState(''),
    [deadline, setDeadline] = useState(0),
    [now, setNow] = useState(0),
    [minutes, setMinutes] = useState(30);
  const [position, setPosition] = useState(0),
    [duration, setDuration] = useState(0),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [loading, setLoading] = useState(false),
    [mediaEpoch, setMediaEpoch] = useState(0);
  const audio = useRef<HTMLAudioElement>(null),
    video = useRef<YouTubePlayer | null>(null),
    dialog = useRef<HTMLElement>(null);
  const active = useRef<ListeningItem | null>(null),
    items = useRef<ListeningItem[]>([]),
    intent = useRef(false),
    generation = useRef(0),
    progressAt = useRef(0),
    hardStop = useRef(false);
  const settings = useRef({ autoNext: true, stopAfterId: '', deadline: 0 });
  settings.current = { autoNext, stopAfterId, deadline };
  const handlers = useRef({
    finish: (_reason: string) => {},
    end: () => {},
    activate: (_item: ListeningItem) => {},
    check: () => false as boolean,
  });
  function saveProgress() {
    const item = active.current;
    if (!item) return;
    const time =
      item.provider === 'audio' ? audio.current?.currentTime : video.current?.getCurrentTime();
    if (time && Number.isFinite(time)) {
      try {
        localStorage.setItem('glimmer-progress:' + item.id, String(time));
      } catch {}
    }
  }
  function pause() {
    intent.current = false;
    audio.current?.pause();
    video.current?.pauseVideo();
    setPlaying(false);
    setLoading(false);
    saveProgress();
  }
  function finish(reason: string) {
    hardStop.current = true;
    pause();
    setDeadline(0);
    settings.current.deadline = 0;
    setStopAfterId('');
    settings.current.stopAfterId = '';
    setMessage(
      reason === 'timer'
        ? L('定时已到，播放已停止。晚安。', 'Your timer has ended. Playback stopped. Good night.')
        : reason === 'target'
          ? L(
              '已播完指定作品，播放已停止。晚安。',
              'Your selected work has finished. Playback stopped. Good night.',
            )
          : reason === 'complete'
            ? L('这份清单已经听完了。', 'You have reached the end of this queue.')
            : L('本段已播完。', 'This recording has finished.'),
    );
  }
  function check() {
    if (settings.current.deadline > 0 && Date.now() >= settings.current.deadline) {
      handlers.current.finish('timer');
      return true;
    }
    return false;
  }
  function activate(item: ListeningItem) {
    if (item.catalogId && unavailable.current.has(item.catalogId)) {
      handlers.current.finish('unavailable');
      setError(
        L(
          '这条素材正在核对来源，已暂停展示。请选择下一段。',
          'This source entry is under review. Please choose another item.',
        ),
      );
      return;
    }

    saveProgress();
    audio.current?.pause();
    video.current?.pauseVideo();
    video.current = null;
    generation.current++;
    setMediaEpoch(generation.current);
    hardStop.current = false;
    active.current = item;
    intent.current = true;
    setCurrent(item);
    setPlaying(false);
    setLoading(true);
    setPosition(0);
    setDuration(item.duration);
    setError('');
    setMessage('');
    document.querySelectorAll('audio').forEach((a) => {
      if (a !== audio.current) a.pause();
    });
    window.speechSynthesis?.cancel();
    window.dispatchEvent(new Event('glimmer:external-play'));
    if (item.provider === 'audio' && audio.current) {
      const element = audio.current;
      element.src = item.audioUrl!;
      element.load();
      const epoch = generation.current;
      void element.play().catch(() => {
        if (epoch === generation.current && intent.current) {
          intent.current = false;
          setLoading(false);
          setPlaying(false);
          setError(
            L(
              '请点击播放继续；若来源暂时不可用，可在原站收听。',
              'Press play to continue, or listen at the source if it is unavailable.',
            ),
          );
        }
      });
    } else if (audio.current) {
      audio.current.removeAttribute('src');
      audio.current.load();
    }
  }
  function ended() {
    // Providers may deliver completion after a timer or source takedown has stopped playback.
    if (hardStop.current) return;
    const item = active.current;
    if (!item) return;
    try {
      localStorage.removeItem('glimmer-progress:' + item.id);
    } catch {}
    const result = afterListeningEnd(items.current, item.id, {
      ...settings.current,
      now: Date.now(),
    });
    if (result.nextId) {
      const next = items.current.find((i) => i.id === result.nextId);
      if (next) handlers.current.activate(next);
    } else handlers.current.finish(result.reason);
  }
  handlers.current = { finish, end: ended, activate, check };
  const start = useCallback((values: ListeningItem[], id?: string, options?: StartOptions) => {
    const list = uniqueQueue(values);
    const item = list.find((i) => i.id === id) ?? list[0];
    if (!item) return;
    items.current = list;
    setQueue(list);
    setStopAfterId('');
    settings.current.stopAfterId = '';
    setAutoNext(true);
    settings.current.autoNext = true;
    const time = options?.minutes ? sleepDeadline(options.minutes, Date.now()) : 0;
    setDeadline(time);
    settings.current.deadline = time;
    setNow(Date.now());
    if (options?.sleep) setFull(true);
    handlers.current.activate(item);
  }, []);
  const toggle = useCallback(() => {
    if (!active.current) return;
    if (intent.current) {
      intent.current = false;
      audio.current?.pause();
      video.current?.pauseVideo();
      setPlaying(false);
      setLoading(false);
      return;
    }
    if (handlers.current.check()) return;
    hardStop.current = false;
    intent.current = true;
    setError('');
    setMessage('');
    if (active.current.provider === 'audio') {
      const epoch = generation.current;
      void audio.current?.play().catch(() => {
        if (epoch !== generation.current || !intent.current) return;
        intent.current = false;
        setPlaying(false);
        setLoading(false);
        setError('请点击来源链接检查这段录音。 / Please check the source link.');
      });
    } else if (video.current) video.current.playVideo();
    else handlers.current.activate(active.current);
  }, []);
  const openSleep = useCallback(() => setFull(true), []);
  const close = useCallback(() => {
    generation.current++;
    intent.current = false;
    audio.current?.pause();
    video.current?.pauseVideo();
    active.current = null;
    items.current = [];
    setCurrent(null);
    setQueue([]);
    setFull(false);
    setPlaying(false);
    setDeadline(0);
    settings.current.deadline = 0;
    setStopAfterId('');
    settings.current.stopAfterId = '';
    if (audio.current) {
      audio.current.removeAttribute('src');
      audio.current.load();
    }
  }, []);
  useEffect(() => {
    const item = active.current;
    if (item?.catalogId && unavailable.current.has(item.catalogId)) {
      hardStop.current = true;
      pause();
      if (audio.current) {
        audio.current.removeAttribute('src');
        audio.current.load();
      }
      setError(
        L(
          '这条素材正在核对来源，播放已停止。',
          'This source is under review. Playback has stopped.',
        ),
      );
    }
  }, [hidden]);
  useEffect(() => {
    const stop = () => close();
    const otherAudio = (e: Event) => {
      if (e.target instanceof HTMLAudioElement && e.target !== audio.current) close();
    };
    document.addEventListener('play', otherAudio, true);
    window.addEventListener('glimmer:audio-play', stop);
    window.addEventListener('glimmer:account-change', stop);
    return () => {
      document.removeEventListener('play', otherAudio, true);
      window.removeEventListener('glimmer:audio-play', stop);
      window.removeEventListener('glimmer:account-change', stop);
    };
  }, [close]);
  useEffect(() => {
    if (!current) return;
    document.body.dataset.listening = 'true';
    const tick = () => {
      handlers.current.check();
      setNow(Date.now());
      if (active.current?.provider === 'youtube' && video.current) {
        const n = video.current.getCurrentTime();
        if (Number.isFinite(n)) setPosition(n);
        const d = video.current.getDuration();
        if (d > 0) setDuration(d);
      }
      if (Date.now() - progressAt.current > 5000) {
        progressAt.current = Date.now();
        saveProgress();
      }
    };
    const interval = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(interval);
      delete document.body.dataset.listening;
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [current?.id]);
  useEffect(() => {
    if (!full) return;
    const previous = document.activeElement as HTMLElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
      if (e.key !== 'Tab') return;
      const controls = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>('button,a,input,select,summary,iframe') ?? [],
      ).filter((e) => e.getClientRects().length > 0);
      const first = controls[0],
        last = controls.at(-1);
      if (
        e.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog.current)
      ) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', key);
      if (previous?.isConnected) previous.focus();
    };
  }, [full]);
  useEffect(() => {
    if (!current || !('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    if ('MediaMetadata' in window)
      session.metadata = new MediaMetadata({
        title: locale === 'en' ? current.titleEn : current.title,
        artist: locale === 'en' ? current.authorEn : current.author,
        album: 'A Glimmer · 慢慢听',
      });
    const controls: { [key: string]: () => void } = {
      play: () => {
        intent.current = false;
        toggle();
      },
      pause: () => {
        if (intent.current) toggle();
      },
      nexttrack: () => {
        const i = items.current.findIndex((n) => n.id === active.current?.id);
        if (items.current[i + 1]) handlers.current.activate(items.current[i + 1]);
      },
      previoustrack: () => {
        const i = items.current.findIndex((n) => n.id === active.current?.id);
        if (items.current[i - 1]) handlers.current.activate(items.current[i - 1]);
      },
    };
    for (const [key, callback] of Object.entries(controls))
      try {
        session.setActionHandler(key as MediaSessionAction, callback);
      } catch {}
    return () => {
      for (const key of Object.keys(controls))
        try {
          session.setActionHandler(key as MediaSessionAction, null);
        } catch {}
      session.metadata = null;
    };
  }, [current?.id, locale, toggle]);
  useEffect(() => {
    if (current && 'mediaSession' in navigator)
      try {
        navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
      } catch {}
  }, [playing, current?.id]);
  const context = useMemo(
    () => ({ current, playing, queue, start, toggle, openSleep }),
    [current, playing, queue, start, toggle, openSleep],
  );
  const index = queue.findIndex((i) => i.id === current?.id),
    remaining = remainingSleepSeconds(deadline, now || Date.now());
  const seek = (n: number) => {
    if (current?.provider === 'audio' && audio.current) audio.current.currentTime = n;
    else video.current?.seekTo(n, true);
    setPosition(n);
  };
  return (
    <Context.Provider value={context}>
      {children}
      <audio
        ref={audio}
        preload="none"
        onLoadedMetadata={(e) => {
          const item = active.current;
          if (!item || item.provider !== 'audio') return;
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) {
            setDuration(d);
            try {
              const resume = resumePosition(localStorage.getItem('glimmer-progress:' + item.id), d);
              if (resume) e.currentTarget.currentTime = resume;
            } catch {}
          }
        }}
        onPlay={(e) => {
          if (!intent.current || active.current?.provider !== 'audio' || handlers.current.check()) {
            e.currentTarget.pause();
            return;
          }
          setPlaying(true);
          setLoading(false);
          setError('');
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => handlers.current.end()}
        onTimeUpdate={(e) => {
          if (active.current?.provider === 'audio') {
            setPosition(e.currentTarget.currentTime);
            handlers.current.check();
          }
        }}
        onWaiting={() => {
          if (intent.current) setLoading(true);
        }}
        onPlaying={() => setLoading(false)}
        onError={() => {
          if (active.current?.provider === 'audio') {
            intent.current = false;
            setPlaying(false);
            setLoading(false);
            setError(
              L(
                '来源暂时无法播放，请重试或打开原站。',
                'This source is unavailable. Retry or open the original page.',
              ),
            );
          }
        }}
      />
      {current ? (
        <section
          ref={dialog}
          className={full ? 'listening-deck sleep-mode' : 'listening-deck'}
          role={full ? 'dialog' : 'region'}
          aria-modal={full ? true : undefined}
          aria-label={L('慢慢听播放器与睡眠模式', 'Listening player and sleep mode')}
          tabIndex={-1}
        >
          <div className="listening-heading">
            <span>
              <Moon size={16} aria-hidden />
              {L(
                full ? '把今晚，交给好声音。' : '正在慢慢听',
                full ? 'Let a good voice keep you company.' : 'Now listening',
              )}
            </span>
            <div>
              {full ? (
                <button className="text-button" onClick={() => setFull(false)}>
                  {L('返回网站，继续收听', 'Back to site, keep listening')}
                </button>
              ) : (
                <button className="text-button" onClick={openSleep}>
                  <Moon size={16} aria-hidden />
                  {L('睡眠模式', 'Sleep mode')}
                </button>
              )}
              <button
                className="icon-button"
                aria-label={L('停止并关闭播放器', 'Stop and close player')}
                onClick={close}
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="listening-main">
            <div className="listening-meta">
              <small>
                {L(
                  `待播清单 ${index + 1} / ${queue.length}`,
                  `Queue ${index + 1} / ${queue.length}`,
                )}
              </small>
              <h2>{locale === 'en' ? current.titleEn : current.title}</h2>
              <p>{locale === 'en' ? current.authorEn : current.author}</p>
              <a href={current.sourceUrl} target="_blank" rel="noreferrer">
                {L('原始出处', 'Original source')} <ExternalLink size={12} aria-hidden />
              </a>
            </div>
            <div className="listening-controls">
              <button
                className="icon-button"
                aria-label={L('上一段', 'Previous recording')}
                disabled={index <= 0}
                onClick={() => activate(queue[index - 1])}
              >
                <SkipBack size={21} />
              </button>
              <button
                className="play-button"
                aria-label={L(
                  playing ? '暂停收听' : '播放或继续收听',
                  playing ? 'Pause listening' : 'Play or resume listening',
                )}
                onClick={toggle}
              >
                {playing ? <Pause size={23} /> : <Play size={23} />}
              </button>
              <button
                className="icon-button"
                aria-label={L('下一段', 'Next recording')}
                disabled={index < 0 || index >= queue.length - 1}
                onClick={() => activate(queue[index + 1])}
              >
                <SkipForward size={21} />
              </button>
              <span className="listening-time">
                {durationLabel(position)} / {durationLabel(duration)}
              </span>
            </div>
          </div>
          {current.provider === 'youtube' ? (
            <SourceVideo
              key={mediaEpoch}
              item={current}
              handlers={{
                ready: (p) => {
                  if (mediaEpoch !== generation.current || active.current?.id !== current.id)
                    return;
                  video.current = p;
                  setLoading(false);
                  if (!handlers.current.check() && intent.current) p.playVideo();
                },
                state: (n) => {
                  if (mediaEpoch !== generation.current || active.current?.id !== current.id)
                    return;
                  if (n === 1) {
                    if (hardStop.current || handlers.current.check()) {
                      video.current?.pauseVideo();
                      return;
                    }
                    intent.current = true;
                    setPlaying(true);
                    setLoading(false);
                    setError('');
                  } else if (n === 0) handlers.current.end();
                  else if (n === 2) {
                    intent.current = false;
                    setPlaying(false);
                  } else if (n === 3 && intent.current) setLoading(true);
                },
                error: () => {
                  if (mediaEpoch !== generation.current || active.current?.id !== current.id)
                    return;
                  intent.current = false;
                  setLoading(false);
                  setPlaying(false);
                  setError(
                    L(
                      '官方播放器暂不可用，请打开原站或手动选择下一段。',
                      'The official player is unavailable. Open the source or choose the next item.',
                    ),
                  );
                },
                blocked: () => {
                  if (mediaEpoch !== generation.current || active.current?.id !== current.id)
                    return;
                  setLoading(false);
                  setPlaying(false);
                  intent.current = false;
                  setError(
                    L(
                      '浏览器暂停了自动播放，请点击视频中的播放按钮继续。',
                      'Your browser blocked autoplay. Press play in the video to continue.',
                    ),
                  );
                },
              }}
            />
          ) : null}
          {duration > 0 ? (
            <input
              className="listening-seek"
              type="range"
              aria-label={L('收听进度', 'Listening progress')}
              min={0}
              max={duration}
              step={0.1}
              value={Math.min(position, duration)}
              onChange={(e) => seek(Number(e.target.value))}
            />
          ) : null}
          {loading ? (
            <p className="listening-message" role="status">
              {L('正在连接声音来源…', 'Connecting to the source…')}
            </p>
          ) : null}
          {error ? (
            <p className="listening-message" role="alert">
              {error}
            </p>
          ) : message ? (
            <p className="listening-message" role="status">
              {message}
            </p>
          ) : null}
          <details className="listening-settings" open={full ? true : undefined}>
            <summary>
              <ListMusic size={15} aria-hidden />
              {L('播放清单与停止条件', 'Queue and stop settings')}
              {deadline
                ? ` · ${durationLabel(remaining)}`
                : stopAfterId
                  ? L(' · 已设定停止作品', ' · Endpoint set')
                  : ''}
            </summary>
            <div className="listening-settings-grid">
              <label className="listening-check">
                <input
                  type="checkbox"
                  checked={autoNext}
                  onChange={(e) => {
                    settings.current.autoNext = e.target.checked;
                    setAutoNext(e.target.checked);
                  }}
                />
                {L('播放结束后自动下一段', 'Automatically play the next item')}
              </label>
              <label>
                {L('倒计时停止（分钟）', 'Stop after (minutes)')}
                <div className="listening-timer">
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={minutes}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                  />
                  <button
                    className="button outline small"
                    disabled={!Number.isInteger(minutes) || minutes < 1 || minutes > 240}
                    onClick={() => {
                      const n = sleepDeadline(minutes, Date.now());
                      settings.current.deadline = n;
                      setDeadline(n);
                      setNow(Date.now());
                      setMessage('');
                    }}
                  >
                    {L('开始计时', 'Set timer')}
                  </button>
                </div>
              </label>
              <label>
                {L('播完哪一部后停止？', 'Stop after which item?')}
                <select
                  value={stopAfterId}
                  onChange={(e) => {
                    settings.current.stopAfterId = e.target.value;
                    setStopAfterId(e.target.value);
                    setMessage('');
                  }}
                >
                  <option value="">{L('不指定，按清单继续', 'Continue through the queue')}</option>
                  {queue.slice(Math.max(0, index)).map((i) => (
                    <option key={i.id} value={i.id}>
                      {locale === 'en' ? i.titleEn : i.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="listening-shortcuts">
                <button
                  className="text-button"
                  onClick={() => {
                    settings.current.stopAfterId = current.id;
                    setStopAfterId(current.id);
                  }}
                >
                  {L('播完当前这部就停止', 'Stop after the current item')}
                </button>
                {deadline ? (
                  <button
                    className="text-button"
                    onClick={() => {
                      settings.current.deadline = 0;
                      setDeadline(0);
                    }}
                  >
                    {L('取消倒计时', 'Cancel timer')}
                  </button>
                ) : null}
              </div>
            </div>
            <p className="small-note">
              {deadline
                ? L(
                    `倒计时剩余 ${durationLabel(remaining)}。`,
                    `Timer remaining: ${durationLabel(remaining)}. `,
                  )
                : ''}
              {L(
                '同时设置时，以先到的条件为准。只停止播放，不关闭浏览器。关闭网页后计时结束；手机系统冻结网页时可能延迟。',
                'When both are set, the first condition wins. Stops playback, not the browser. Timers end when the page closes; a frozen mobile browser may delay stopping.',
              )}
            </p>
          </details>
          <p className="listening-source-note">
            {current.provider === 'youtube'
              ? L(
                  '官方视频保留画面与控制；后台播放和字幕以来源平台为准。',
                  'Official video remains visible. Background playback and captions depend on the source.',
                )
              : current.catalogId
                ? L(
                    '连接原站音频，不转存。LibriVox 公版声明以美国为依据，地区状态可能不同。',
                    'Streams from the original source. LibriVox public-domain status is based on USA law and may differ elsewhere.',
                  )
                : L('用户投稿，原始录音。', 'An original community recording.')}
          </p>
        </section>
      ) : null}
    </Context.Provider>
  );
}
