'use client';
import { LocalizedView } from './preferences';
import {
  Play,
  Pause,
  Mic,
  Heart,
  Bookmark,
  ArrowRight,
  X,
  Sun,
  Headphones,
  Leaf,
  Clock,
  Upload,
  Download,
  Shuffle,
  Check,
  Mail,
  ArrowLeft,
  Shield,
  Trash2,
} from 'lucide-react';
import { usePreferences, PreferencesMenu, themeImages } from './preferences';
import VoicePostcard from './voice-postcard';
import { canMakePostcard } from '@/lib/postcard';
import AvatarSettings from './avatar-settings';
import AccountClosure from './account-closure';
import AdminOperations from './admin-operations';
import TopicChannel from './topic-channel';
import { GentleListening, VoiceRings } from './gentle-experiences';
import { AnnualRecap, CalendarReminder } from './memory-tools';
import FeaturedListening from './featured-listening';
import { useListening } from './listening-player';
import { voiceListeningItem } from '@/lib/listening';
import QuoteLibrary from './quote-library';
import type { ClassicQuote } from '@/lib/quotes';
import { QUOTE_THEMES } from '@/lib/quote-themes';
import { podcastChapters, resumePosition } from '@/lib/podcast';
import PodcastShelf from './podcast-shelf';
import AuthDialog from './auth-dialog';
import { TOPICS, getTopic, type Topic } from '@/lib/topics';
import { audioMime } from '@/lib/audio-file';
import { webmDuration } from '@/lib/audio-duration';

import { useEffect, useRef, useState } from 'react';
import { MOODS, PROMPTS, type Voice, dateLabel, durationLabel } from '@/lib/shared';
import { readDraft, readLegacyDraft, writeDraft } from '@/lib/draft';
import { makeVerifiedZip, download } from '@/lib/zip';

type View =
  | 'wall'
  | 'inspiration'
  | 'archive'
  | 'studio'
  | 'admin'
  | 'about'
  | 'topic'
  | 'podcast'
  | 'quotes';
type User = { nickname: string; userId: string; admin: boolean; avatarUrl?: string | null };
type Draft = {
  title: string;
  signature: string;
  recordedAt: string;
  mood: string;
  transcript: string;
  source: string;
  visibility: string;
  futureYear: string;
  parentId: string;
  topic: string;
};
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const initialDraft = (): Draft => ({
  title: '',
  signature: '',
  recordedAt: today(),
  mood: '有点累',
  transcript: '',
  source: '',
  visibility: 'public',
  futureYear: '',
  parentId: '',
  topic: '',
});
async function api(url: string, options?: RequestInit) {
  const r = await fetch(url, options);
  const data = (await r.json()) as any;
  if (!r.ok) throw new Error(data.error ?? '暂时无法完成，请重试');
  return data;
}
const iconMap = {
  play: Play,
  pause: Pause,
  mic: Mic,
  heart: Heart,
  save: Bookmark,
  arrow: ArrowRight,
  close: X,
  sun: Sun,
  headphones: Headphones,
  leaf: Leaf,
  clock: Clock,
  upload: Upload,
  download: Download,
  shuffle: Shuffle,
  check: Check,
  mail: Mail,
  back: ArrowLeft,
  shield: Shield,
  trash: Trash2,
};
function Icon({ name, size = 20, fill = false }: { name: string; size?: number; fill?: boolean }) {
  const Component = iconMap[name as keyof typeof iconMap] || Sun;
  return (
    <Component size={size} strokeWidth={1.5} fill={fill ? 'currentColor' : 'none'} aria-hidden />
  );
}
function Wave({ progress = 0, active = false }: { progress?: number; active?: boolean }) {
  return (
    <span className={`wave ${active ? 'active' : ''}`} aria-hidden="true">
      {Array.from({ length: 45 }, (_, i) => (
        <i
          key={i}
          className={i / 45 < progress ? 'played' : ''}
          style={{
            height: `${6 + ((i * 17 + i * i * 7) % 27)}px`,
            animationDelay: `${i * 0.035}s`,
          }}
        />
      ))}
    </span>
  );
}
function Landscape() {
  const { theme } = usePreferences();
  return (
    <div className="landscape" aria-hidden="true">
      <img src={themeImages[theme]} alt="" />
      <span className="landscape-fade" />
    </div>
  );
}

export default function VoiceApp() {
  const { locale, t, theme } = usePreferences();
  const listening = useListening();
  const [authOpen, setAuthOpen] = useState(false);
  const [postcard, setPostcard] = useState<Voice | null>(null);
  const [studioStep, setStudioStep] = useState(1);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const sleepDeadline = useRef(0);
  const progressWrite = useRef(0);
  useEffect(() => {
    if (sleepMinutes <= 0) return;
    const check = () => {
      if (Date.now() >= sleepDeadline.current) {
        audioRef.current?.pause();
        window.speechSynthesis?.cancel();
        setIsPlaying(false);
        setSleepMinutes(0);
        notify('睡眠定时已暂停播放。晚安。');
      }
    };
    const tick = setInterval(check, 1000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [sleepMinutes]);
  function createPodcast() {
    if (hasDraft()) {
      notify('请先保存或清空现有草稿，再开始播客。');
      navigate('studio');
      return;
    }
    setDraft({ ...initialDraft(), signature: user?.nickname ?? '', topic: 'podcast' });
    navigate('studio');
  }
  const [view, setView] = useState<View>('wall'),
    [user, setUser] = useState<User | null>(null),
    [meLoaded, setMeLoaded] = useState(false),
    [voices, setVoices] = useState<Voice[]>([]),
    [own, setOwn] = useState<Voice[]>([]),
    [saved, setSaved] = useState<Voice[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [wallCursor, setWallCursor] = useState<string | null>(null),
    [wallMoreLoading, setWallMoreLoading] = useState(false),
    [mood, setMood] = useState(''),
    [mode, setMode] = useState('featured'),
    [topicId, setTopicId] = useState(''),
    [topicCounts, setTopicCounts] = useState<Record<string, number> | null>(null),
    [topicError, setTopicError] = useState(''),
    [adminMessages, setAdminMessages] = useState<any[]>([]),
    [query, setQuery] = useState(''),
    [toast, setToast] = useState(''),
    [selected, setSelected] = useState<Voice | null>(null),
    [archiveTab, setArchiveTab] = useState('all'),
    [year, setYear] = useState('all'),
    [nickname, setNickname] = useState(''),
    [exporting, setExporting] = useState(false),
    [adminVoices, setAdminVoices] = useState<Voice[]>([]),
    [reports, setReports] = useState<any[]>([]),
    [reviewNotes, setReviewNotes] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<Voice | null>(null),
    [isPlaying, setIsPlaying] = useState(false),
    [position, setPosition] = useState(0),
    [audioDuration, setAudioDuration] = useState(0),
    [rate, setRate] = useState(1);
  const [adminStatus, setAdminStatus] = useState('all');
  const [adminPages, setAdminPages] = useState({ voices: 0, messages: 0, reports: 0 });
  const [adminPagination, setAdminPagination] = useState<
    Record<string, { page: number; total: number; limit: number; hasNext: boolean }>
  >({});
  const [adminPending, setAdminPending] = useState({ voices: 0, messages: 0 });
  const [adminLoading, setAdminLoading] = useState(false),
    [adminError, setAdminError] = useState('');
  const adminRequestRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!('mediaSession' in navigator) || !playing || !playing.audioUrl) return;
    const session = navigator.mediaSession;
    if (typeof MediaMetadata !== 'undefined')
      session.metadata = new MediaMetadata({
        title: playing.title,
        artist: playing.signature,
        album: '一点光 · A Glimmer',
      });
    const actions: MediaSessionAction[] = [
      'play',
      'pause',
      'seekbackward',
      'seekforward',
      'seekto',
    ];
    for (const action of actions) {
      try {
        session.setActionHandler(action, (detail) => {
          const audio = audioRef.current;
          if (!audio) return;
          if (action === 'play') void audio.play().catch(() => notify('请回到页面点击播放。'));
          else if (action === 'pause') audio.pause();
          else if (Number.isFinite(audio.duration))
            audio.currentTime = Math.max(
              0,
              Math.min(
                audio.duration,
                action === 'seekto'
                  ? (detail.seekTime ?? audio.currentTime)
                  : audio.currentTime +
                      (action === 'seekbackward' ? -1 : 1) * (detail.seekOffset ?? 15),
              ),
            );
        });
      } catch {}
    }
    return () => {
      for (const action of actions) {
        try {
          session.setActionHandler(action, null);
        } catch {}
      }
      session.metadata = null;
    };
  }, [playing]);
  useEffect(() => {
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = playing
          ? isPlaying
            ? 'playing'
            : 'paused'
          : 'none';
      } catch {}
    }
  }, [playing, isPlaying]);
  const modalRef = useRef<HTMLElement>(null);
  const meRequestRef = useRef(0);
  const draftScopeRef = useRef<string | null>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [draft, setDraft] = useState<Draft>(initialDraft),
    [blob, setBlob] = useState<Blob | null>(null),
    [blobUrl, setBlobUrl] = useState(''),
    [duration, setDuration] = useState(0),
    [recording, setRecording] = useState(false),
    [recordSeconds, setRecordSeconds] = useState(0),
    [draftLoaded, setDraftLoaded] = useState(false),
    [legacyDraftAvailable, setLegacyDraftAvailable] = useState(false),
    [promptIndex, setPromptIndex] = useState(0),
    [consent, setConsent] = useState(false),
    [submitMessage, setSubmitMessage] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null),
    streamRef = useRef<MediaStream | null>(null),
    timerRef = useRef<ReturnType<typeof setInterval> | null>(null),
    startedRef = useRef(0),
    uploadRef = useRef<HTMLInputElement>(null);
  const priorAccount = useRef<string | null>(null);
  useEffect(() => {
    const prior = priorAccount.current;
    priorAccount.current = user?.userId ?? null;
    if (prior && prior !== user?.userId) {
      window.dispatchEvent(new Event('glimmer:account-change'));
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.removeAttribute('src');
      window.speechSynthesis?.cancel();
      setPlaying(null);
      setSelected(null);
      setPostcard(null);
      setIsPlaying(false);
      setSleepMinutes(0);
      setAdminVoices([]);
      setReports([]);
      setAdminMessages([]);
    }
  }, [user?.userId]);
  const notify = (s: string) => setToast(s);
  useEffect(() => {
    const stop = () => {
      audioRef.current?.pause();
      setIsPlaying(false);
      setPlaying(null);
      setSleepMinutes(0);
    };
    window.addEventListener('glimmer:external-play', stop);
    return () => window.removeEventListener('glimmer:external-play', stop);
  }, []);
  function hasDraft() {
    return !!(
      blob ||
      draft.title.trim() ||
      draft.transcript.trim() ||
      draft.source.trim() ||
      draft.parentId
    );
  }
  function startFromQuote(quote: ClassicQuote) {
    if (!draftLoaded) {
      notify('正在恢复此账户的草稿…');
      return;
    }
    if (hasDraft()) {
      notify('请先保存或清空工作台里的草稿，再开始年轮录音。');
      navigate('studio');
      return;
    }
    setDraft({
      ...initialDraft(),
      signature: user?.nickname ?? '',
      title: ('听《' + quote.work + '》有感').slice(0, 60),
      transcript: '',
      mood: QUOTE_THEMES.find((t) => t.id === quote.theme)!.mood,
      source: `${quote.author}《${quote.work}》；听后感灵感来源；${quote.sourceUrl}`.slice(0, 300),
    });
    setConsent(false);
    navigate('studio');
  }
  const openAuth = () => {
    setSelected(null);
    setAuthOpen(true);
  };
  async function completeAuth() {
    const signedIn = await loadMe(true);
    if (!signedIn) throw new Error('登录状态未保存，请重试。');
    setAuthOpen(false);
    notify(
      signedIn.provider === 'local'
        ? '本地演示账户已登录，邮箱服务尚未接通。'
        : '登录成功。你的声音档案已经准备好。',
    );
  }
  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
      meRequestRef.current++;
      audioRef.current?.pause();
      audioRef.current?.removeAttribute('src');
      audioRef.current?.load();
      window.speechSynthesis?.cancel();
      speechRef.current = null;
      setPlaying(null);
      setIsPlaying(false);
      setSelected(null);
      setPostcard(null);
      setSleepMinutes(0);
      setDraftLoaded(false);
      setDraft(initialDraft());
      setBlob(null);
      setDuration(0);
      setConsent(false);
      setUser(null);
      setOwn([]);
      setSaved([]);
      setAdminVoices([]);
      setAdminMessages([]);
      setReports([]);
      adminRequestRef.current++;
      void loadWall();
      notify('已退出当前设备。');
    } catch (e) {
      notify((e as Error).message);
    }
  }
  const navigate = (v: View) => {
    setView(v);
    setSelected(null);
    setSubmitMessage('');
    if (v === 'studio') setStudioStep(1);
    const url = new URL(location.href);
    url.search = '';
    if (v !== 'wall') url.searchParams.set('view', v);
    history.pushState({}, '', url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const openTopic = (t: Topic) => {
    setTopicId(t.id);
    navigate('topic');
    history.replaceState({}, '', '/?view=topic&topic=' + t.id);
  };
  async function loadTopics() {
    try {
      const d = await api('/api/topics');
      setTopicCounts(Object.fromEntries(d.topics.map((t: any) => [t.id, t.count])));
      setTopicError('');
    } catch {
      setTopicError('频道状态暂时无法读取，可以稍后刷新。');
    }
  }
  useEffect(() => {
    void loadTopics();
  }, [view]);
  const update = (key: keyof Draft, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  async function loadMe(strict = false) {
    const requestId = ++meRequestRef.current;
    try {
      const data = await api('/api/me');
      if (requestId !== meRequestRef.current) return null;
      setUser(data.user);
      setOwn(data.voices ?? []);
      setSaved(data.saved ?? []);
      setNickname(data.user?.nickname ?? '');
      setMeLoaded(true);
      if (data.user) setDraft((d) => ({ ...d, signature: d.signature || data.user.nickname }));
      return data.user;
    } catch (e) {
      if (requestId !== meRequestRef.current) return null;
      setMeLoaded(true);
      notify((e as Error).message);
      if (strict) throw e;
      return null;
    }
  }
  const wallRequestRef = useRef(0);
  async function loadWall() {
    const requestId = ++wallRequestRef.current;
    setLoading(true);
    setError('');
    setWallCursor(null);
    setWallMoreLoading(false);
    try {
      const params = new URLSearchParams({ mode });
      if (mood) params.set('mood', mood);
      if (query.trim()) params.set('q', query.trim());
      const data = await api(`/api/voices?${params}`);
      if (requestId === wallRequestRef.current) {
        setVoices(data.voices);
        setWallCursor(data.nextCursor ?? null);
      }
    } catch (e) {
      if (requestId === wallRequestRef.current) setError((e as Error).message);
    } finally {
      if (requestId === wallRequestRef.current) setLoading(false);
    }
  }
  async function loadMoreVoices() {
    if (!wallCursor || loading || wallMoreLoading) return;
    const requestId = wallRequestRef.current;
    setWallMoreLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ mode, before: wallCursor });
      if (mood) params.set('mood', mood);
      if (query.trim()) params.set('q', query.trim());
      const data = await api('/api/voices?' + params);
      if (requestId !== wallRequestRef.current) return;
      setVoices((current) => [
        ...new Map([...current, ...data.voices].map((v: Voice) => [v.id, v])).values(),
      ]);
      setWallCursor(data.nextCursor ?? null);
    } catch (e) {
      if (requestId === wallRequestRef.current) setError((e as Error).message);
    } finally {
      if (requestId === wallRequestRef.current) setWallMoreLoading(false);
    }
  }
  async function loadAdmin() {
    const requestId = ++adminRequestRef.current;
    setAdminLoading(true);
    setAdminError('');
    try {
      const params = new URLSearchParams({
        status: adminStatus,
        voicePage: String(adminPages.voices),
        messagePage: String(adminPages.messages),
        reportPage: String(adminPages.reports),
      });
      const data = await api('/api/admin?' + params);
      if (requestId !== adminRequestRef.current) return;
      setAdminVoices(data.voices);
      setReports(data.reports);
      setAdminMessages(data.messages ?? []);
      setAdminPagination(data.pagination ?? {});
      setAdminPending(data.pending ?? { voices: 0, messages: 0 });
      setAdminPages((previous) => {
        const next = { ...previous };
        for (const key of ['voices', 'messages', 'reports'] as const) {
          const page = data.pagination?.[key];
          if (page)
            next[key] = Math.min(
              previous[key],
              Math.max(0, Math.ceil(page.total / page.limit) - 1),
            );
        }
        return Object.keys(next).some(
          (key) => next[key as keyof typeof next] !== previous[key as keyof typeof previous],
        )
          ? next
          : previous;
      });
    } catch (e) {
      if (requestId === adminRequestRef.current) setAdminError((e as Error).message);
    } finally {
      if (requestId === adminRequestRef.current) setAdminLoading(false);
    }
  }
  function adminPager(kind: 'voices' | 'messages' | 'reports') {
    const p = adminPagination[kind];
    if (!p) return null;
    return (
      <div
        className="admin-pagination"
        role="group"
        aria-label={t(
          kind === 'voices' ? '声音审核分页' : kind === 'messages' ? '频道审核分页' : '举报分页',
        )}
      >
        <button
          className="button outline small"
          disabled={busy || adminLoading || p.page === 0}
          onClick={() => setAdminPages((v) => ({ ...v, [kind]: v[kind] - 1 }))}
        >
          上一页
        </button>
        <span>
          {locale === 'en'
            ? `Page ${p.page + 1} of ${Math.max(1, Math.ceil(p.total / p.limit))} · ${p.total} total`
            : `第 ${p.page + 1} / ${Math.max(1, Math.ceil(p.total / p.limit))} 页 · 共 ${p.total} 项`}
        </span>
        <button
          className="button outline small"
          disabled={busy || adminLoading || !p.hasNext}
          onClick={() => setAdminPages((v) => ({ ...v, [kind]: v[kind] + 1 }))}
        >
          下一页
        </button>
      </div>
    );
  }
  useEffect(() => {
    void loadMe();
    const readUrl = () => {
      const p = new URLSearchParams(location.search);
      const v = p.get('view');
      setView(
        [
          'wall',
          'inspiration',
          'archive',
          'studio',
          'admin',
          'about',
          'topic',
          'podcast',
          'quotes',
        ].includes(v ?? '')
          ? (v as View)
          : 'wall',
      );
      const t = p.get('topic');
      setTopicId(t && getTopic(t) ? t : '');
      const id = p.get('voice');
      if (id)
        api(`/api/voices/${encodeURIComponent(id)}`)
          .then((d) => setSelected(d.voice))
          .catch((e) => notify(e.message));
    };
    readUrl();
    window.addEventListener('popstate', readUrl);
    return () => window.removeEventListener('popstate', readUrl);
  }, []);
  useEffect(() => {
    wallRequestRef.current++;
    setLoading(true);
    setWallCursor(null);
    setWallMoreLoading(false);
    const timer = setTimeout(() => void loadWall(), query.trim() ? 250 : 0);
    return () => clearTimeout(timer);
  }, [mood, mode, query]);
  useEffect(() => {
    if (view === 'archive') void loadMe();
    if (view === 'admin' && user?.admin) void loadAdmin();
  }, [view, user?.admin, adminStatus, adminPages.voices, adminPages.messages, adminPages.reports]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    void readLegacyDraft()
      .then((d) => setLegacyDraftAvailable(!!d))
      .catch(() => {});
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (!meLoaded) return;
    const scope = user?.userId ?? 'guest';
    if (scope === draftScopeRef.current) return;
    const previous = draftScopeRef.current;
    const guestDraft =
      previous === 'guest' && scope !== 'guest' && hasDraft() ? { draft, blob, duration } : null;
    draftScopeRef.current = scope;
    let cancelled = false;
    setDraftLoaded(false);
    setConsent(false);
    async function restore() {
      try {
        const existing = await readDraft(scope);
        if (cancelled) return;
        const saved = existing ?? guestDraft;
        setDraft({ ...initialDraft(), signature: user?.nickname ?? '', ...saved?.draft });
        setBlob(saved?.blob ?? null);
        setDuration(saved?.duration ?? 0);
        if (guestDraft && !existing) {
          await writeDraft(guestDraft, scope);
          await writeDraft(null, 'guest');
        } else if (guestDraft && existing) {
          notify('已恢复此账户的草稿。登录前的草稿仍保存在本机游客工作台。');
        }
      } catch {
        if (!cancelled) {
          setDraft({ ...initialDraft(), signature: user?.nickname ?? '' });
          setBlob(null);
          setDuration(0);
          notify('此浏览器不能恢复本地草稿，请及时下载录音。');
        }
      } finally {
        if (!cancelled) setDraftLoaded(true);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, [meLoaded, user?.userId]);
  useEffect(() => {
    if (!blob) {
      setBlobUrl('');
      return;
    }
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  useEffect(() => {
    if (!draftLoaded) return;
    const scope = draftScopeRef.current;
    if (!scope || scope !== (user?.userId ?? 'guest')) return;
    const t = setTimeout(() => {
      writeDraft(hasDraft() ? { draft, blob, duration } : null, scope).catch(() =>
        notify('此浏览器不能保存本地草稿，请在离开前下载录音。'),
      );
    }, 350);
    return () => clearTimeout(t);
  }, [draft, blob, duration, draftLoaded, user?.userId]);
  useEffect(() => {
    if (!selected) return;
    const old = document.body.style.overflow;
    const previous = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    modalRef.current?.focus();
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
      if (e.key === 'Tab') {
        const items = modalRef.current?.querySelectorAll<HTMLElement>(
          'button,a,input,select,textarea',
        );
        if (items?.length) {
          const first = items[0],
            last = items[items.length - 1];
          if (
            e.shiftKey &&
            (document.activeElement === first || document.activeElement === modalRef.current)
          ) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = old;
      window.removeEventListener('keydown', close);
      previous?.focus();
    };
  }, [selected?.id]);
  useEffect(
    () => () => {
      window.speechSynthesis?.cancel();
    },
    [],
  );
  useEffect(() => {
    if (view !== 'studio' && recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, [view]);
  async function play(v: Voice) {
    window.dispatchEvent(new Event('glimmer:audio-play'));
    const a = audioRef.current;
    if (!a) return;
    document.querySelectorAll<HTMLAudioElement>('audio').forEach((item) => {
      if (item !== a) item.pause();
    });
    if (v.demo && !v.audioUrl) {
      if (!window.speechSynthesis) {
        notify('当前浏览器不支持示例朗读，可以查看文字稿或上传真实录音体验。');
        return;
      }
      if (playing?.id === v.id && speechRef.current && window.speechSynthesis.speaking) {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
          setIsPlaying(true);
        } else {
          window.speechSynthesis.pause();
          setIsPlaying(false);
        }
        return;
      }
      window.speechSynthesis.cancel();
      a.pause();
      setPlaying(v);
      setPosition(0);
      setAudioDuration(v.duration);
      const speech = new SpeechSynthesisUtterance(v.transcript);
      speech.lang = 'zh-CN';
      speech.rate = 0.85;
      const voice = window.speechSynthesis.getVoices().find((x) => x.lang.startsWith('zh'));
      if (voice) speech.voice = voice;
      speechRef.current = speech;
      speech.onstart = () => {
        if (speechRef.current === speech) setIsPlaying(true);
      };
      speech.onboundary = (e) => setPosition(Math.min(v.duration, e.elapsedTime));
      speech.onend = () => {
        if (speechRef.current !== speech) return;
        setIsPlaying(false);
        setPosition(v.duration);
        speechRef.current = null;
      };
      speech.onerror = () => {
        if (speechRef.current !== speech) return;
        setIsPlaying(false);
        speechRef.current = null;
      };
      window.speechSynthesis.speak(speech);
      return;
    }
    window.speechSynthesis?.cancel();
    speechRef.current = null;
    if (playing?.id === v.id && !a.paused) {
      a.pause();
      return;
    }
    if (playing?.id !== v.id) {
      setPlaying(v);
      setPosition(0);
      setAudioDuration(v.duration);
      a.src = v.audioUrl;
    }
    a.playbackRate = rate;
    try {
      await a.play();
    } catch {
      notify('音频暂时无法播放，请稍后再试。');
    }
  }
  function randomPlay() {
    const list = filtered.length ? filtered : voices;
    if (!list.length) {
      notify('这个心情还没有声音，换一个试试吧。');
      return;
    }
    const available = list.filter((v) => v.id !== playing?.id);
    void play(
      (available.length ? available : list)[
        Math.floor(Math.random() * (available.length || list.length))
      ],
    );
  }
  async function react(v: Voice, kind: 'heart' | 'save') {
    if (v.demo) {
      notify('这是示例朗读。真实投稿上线后，可以收藏和送出力量。');
      return;
    }
    if (!user) {
      openAuth();
      notify('登录后，就能收藏声音和送出力量。');
      return;
    }
    const active = kind === 'heart' ? !v.loved : !v.saved;
    try {
      await api(`/api/voices/${v.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: kind, active }),
      });
      const updateVoice = (x: Voice) =>
        x.id === v.id
          ? {
              ...x,
              ...(kind === 'heart'
                ? { loved: active, hearts: Math.max(0, x.hearts + (active ? 1 : -1)) }
                : { saved: active }),
            }
          : x;
      setVoices((a) => a.map(updateVoice));
      setSelected((s) => (s ? updateVoice(s) : s));
      void loadMe();
      notify(
        kind === 'heart'
          ? active
            ? '你的善意，已经送到。'
            : '已收回这次回应'
          : active
            ? '已放进你的收藏'
            : '已取消收藏',
      );
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function share(v: Voice) {
    const url = new URL(location.origin);
    url.searchParams.set('voice', v.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      notify('声音链接已复制，分享这一点光。');
    } catch {
      notify('请复制浏览器地址栏中的声音链接。');
      history.replaceState({}, '', url);
    }
  }
  async function report(v: Voice) {
    if (v.demo) {
      notify('这是一段示例录音。');
      return;
    }
    if (!user) {
      openAuth();
      notify('登录后可以举报，我们会认真处理。');
      return;
    }
    const reason = window.prompt(t('这段声音有什么问题？（最多 300 字）'));
    if (!reason) return;
    try {
      await api(`/api/voices/${v.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'report', reason }),
      });
      notify('举报已收到，审核员会检查这段声音。');
    } catch (e) {
      notify((e as Error).message);
    }
  }
  function choosePrompt(index: number) {
    setPromptIndex(index);
    update('mood', PROMPTS[index].mood);
    navigate('studio');
  }
  async function startRecording() {
    if (draft.topic === 'podcast') {
      notify('长内容请先录制好，再上传 1–30 分钟的音频。');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      notify('当前浏览器不支持录音，请使用 HTTPS 或上传已有音频。');
      return;
    }
    try {
      if (blob && !window.confirm(t('已有一段草稿。开始新录音会替换它，继续吗？'))) return;
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setRecording(false);
        const elapsed = Math.min(90, (Date.now() - startedRef.current) / 1000);
        if (elapsed < 1) {
          notify('至少录制一秒，再保存吧。');
          return;
        }
        setBlob(new Blob(chunks, { type: rec.mimeType }));
        setDuration(elapsed);
        setConsent(false);
      };
      rec.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (timerRef.current) clearInterval(timerRef.current);
        notify('录音中断，请重新尝试。');
      };
      rec.start(250);
      startedRef.current = Date.now();
      setRecordSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => {
        const n = Math.floor((Date.now() - startedRef.current) / 1000);
        setRecordSeconds(Math.min(n, 90));
        if (n >= 90 && rec.state === 'recording') rec.stop();
      }, 200);
    } catch (e) {
      notify(
        (e as DOMException).name === 'NotAllowedError'
          ? '麦克风权限未开启。可以在浏览器设置中允许，或上传录音。'
          : '无法打开麦克风，请检查设备是否被其他应用占用。',
      );
    }
  }
  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }
  async function upload(file?: File) {
    if (!file) return;
    const mime = audioMime(file.name, file.type);
    if (!mime || file.size > (draft.topic === 'podcast' ? 30 : 10) * 1024 * 1024) {
      notify(`请选择 ${draft.topic === 'podcast' ? 30 : 10} MB 以内的音频文件。`);
      return;
    }
    if (blob && !window.confirm(t('上传会替换当前录音草稿，继续吗？'))) return;
    const url = URL.createObjectURL(file),
      a = new Audio(url);
    try {
      let n = await new Promise<number>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('无法读取音频时长，请换一个文件')), 10000);
        a.onloadedmetadata = () => {
          clearTimeout(t);
          resolve(a.duration);
        };
        a.onerror = () => {
          clearTimeout(t);
          reject(new Error('浏览器无法读取此音频，请使用 MP3 或 WAV'));
        };
      });
      if (!Number.isFinite(n) && mime === 'audio/webm')
        n = webmDuration(new Uint8Array(await file.arrayBuffer()));
      if (
        !Number.isFinite(n) ||
        n < (draft.topic === 'podcast' ? 60 : 1) ||
        n > (draft.topic === 'podcast' ? 1800.5 : 90.5)
      )
        throw new Error(
          draft.topic === 'podcast' ? '请上传 1–30 分钟的播客' : '请上传 1–90 秒的音频',
        );
      setBlob(new Blob([file], { type: mime }));
      setDuration(n);
      setConsent(false);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      URL.revokeObjectURL(url);
      if (uploadRef.current) uploadRef.current.value = '';
    }
  }
  async function submit() {
    if (recording) {
      notify('请先结束录音。');
      return;
    }
    if (!blob) {
      notify('先录下一段声音，或者上传音频。');
      return;
    }
    if (!draft.title.trim() || !draft.signature.trim()) {
      notify('请填写标题和此刻的署名。');
      return;
    }
    if (!consent) {
      notify('请确认你拥有这段音频的发布权，并同意保存规则。');
      return;
    }
    if (!user) {
      try {
        await writeDraft({ draft, blob, duration }, draftScopeRef.current ?? 'guest');
        openAuth();
      } catch {
        notify('无法保存草稿，请先下载录音再登录。');
      }
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set(
        'audio',
        blob,
        `voice.${blob.type.includes('mp4') ? 'm4a' : blob.type.includes('wav') ? 'wav' : 'webm'}`,
      );
      Object.entries(draft).forEach(([k, v]) => form.set(k, v));
      form.set('duration', String(duration));
      const result = await api('/api/voices', { method: 'POST', body: form });
      await writeDraft(null, draftScopeRef.current ?? 'guest').catch(() =>
        notify('声音已保存，但本地草稿清理失败。请勿重复提交。'),
      );
      setBlob(null);
      setDuration(0);
      setDraft({ ...initialDraft(), signature: user.nickname });
      setConsent(false);
      setSubmitMessage(
        result.status === 'pending'
          ? '声音已保存。它正在等待审核，通过后会被陌生人听见。'
          : '声音已放进你的私人档案。未来的你，随时可以回来听。',
      );
      await loadMe();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(v: Voice) {
    if (!window.confirm(t('删除后无法恢复。建议先导出备份，确定删除这段声音吗？'))) return;
    try {
      await api(`/api/voices/${v.id}`, { method: 'DELETE' });
      if (playing?.id === v.id) {
        audioRef.current?.pause();
        setPlaying(null);
      }
      await loadMe();
      void loadWall();
      notify('这段声音已删除。');
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function hide(v: Voice) {
    try {
      await api(`/api/voices/${v.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'hide' }),
      });
      await loadMe();
      void loadWall();
      notify('已设为仅自己可见。');
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function requestPublication(v: Voice) {
    if (
      !window.confirm(t('申请公开后，审核员可以听到这段声音。通过审核后才会对陌生人公开，继续吗？'))
    )
      return;
    setBusy(true);
    try {
      await api(`/api/voices/${v.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish' }),
      });
      await loadMe();
      notify('已申请公开，正在等待人工审核。');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function discardDraft() {
    if (!window.confirm(t('清空会移除此工作台的本地草稿。已保存的声音不受影响，继续吗？'))) return;
    try {
      await writeDraft(null, draftScopeRef.current ?? 'guest');
      setDraft({ ...initialDraft(), signature: user?.nickname ?? '' });
      setBlob(null);
      setDuration(0);
      setConsent(false);
      setStudioStep(1);
      notify('当前工作台的草稿已清空。');
    } catch {
      notify('本地草稿未能清空，请稍后重试。');
    }
  }
  async function restoreLegacyDraft() {
    if (
      !window.confirm(
        t(
          '升级前的本机草稿没有账户标识。请确认这台设备保存的是你的草稿。恢复会替换当前工作台，继续吗？',
        ),
      )
    )
      return;
    try {
      const saved = await readLegacyDraft();
      if (!saved) {
        setLegacyDraftAvailable(false);
        return;
      }
      await writeDraft(saved, draftScopeRef.current ?? 'guest');
      setDraft({ ...initialDraft(), ...saved.draft });
      setBlob(saved.blob ?? null);
      setDuration(saved.duration ?? 0);
      setConsent(false);
      setLegacyDraftAvailable(false);
      notify('升级前的本机草稿已恢复到当前工作台。');
    } catch {
      notify('此浏览器不能恢复本地草稿，请及时下载录音。');
    }
  }
  async function saveNickname() {
    try {
      const r = await api('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname }),
      });
      setUser((u) => (u ? { ...u, nickname: r.nickname } : u));
      notify('新署名已保存，旧录音的署名保持原样。');
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function exportArchive() {
    setExporting(true);
    try {
      const data = await api('/api/export');
      const meta = new TextEncoder().encode(JSON.stringify(data, null, 2));
      let files = [{ name: 'archive.json', data: meta }],
        size = meta.length,
        part = 1;
      const allMedia = [
        ...(data.profile?.avatarUrl
          ? [
              {
                id: 'avatar',
                folder: 'profile',
                audioUrl: data.profile.avatarUrl,
                mime: data.profile.avatarMime,
                recorded_at: data.exportedAt.slice(0, 10),
              },
            ]
          : []),
        ...data.voices.map((v: any) => ({ ...v, folder: 'audio' })),
        ...(data.messages ?? [])
          .filter((m: any) => m.kind === 'image')
          .map((m: any) => ({
            ...m,
            audioUrl: m.mediaUrl,
            recorded_at: m.created_at.slice(0, 10),
            folder: 'images',
          })),
      ];
      for (let i = 0; i < allMedia.length; i++) {
        const v = allMedia[i];
        const r = await fetch(v.audioUrl);
        if (!r.ok) throw new Error(`第 ${i + 1} 段音频导出失败，请重试`);
        const bytes = new Uint8Array(await r.arrayBuffer());
        if (size + bytes.length > 40 * 1024 * 1024) {
          download(
            await makeVerifiedZip(files, { exportedAt: data.exportedAt, part }),
            `一点光-档案-${part++}.zip`,
          );
          files = [{ name: 'archive.json', data: meta }];
          size = meta.length;
        }
        const ext =
          (
            {
              'audio/mp4': 'm4a',
              'audio/mpeg': 'mp3',
              'audio/wav': 'wav',
              'audio/x-wav': 'wav',
              'audio/ogg': 'ogg',
              'image/png': 'png',
              'image/jpeg': 'jpg',
              'image/webp': 'webp',
            } as Record<string, string>
          )[v.mime] ?? 'webm';
        files.push({ name: `${v.folder}/${v.recorded_at}-${v.id}.${ext}`, data: bytes });
        size += bytes.length;
      }
      download(
        await makeVerifiedZip(files, { exportedAt: data.exportedAt, part }),
        `一点光-档案-${part}.zip`,
      );
      notify('档案已导出，包含原音频、时间、署名和逐文件校验清单。请保留所有分卷。');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  async function review(id: string, action: string, kind?: string) {
    setBusy(true);
    try {
      await api('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, kind, note: reviewNotes[id] ?? '' }),
      });
      await loadAdmin();
      void loadWall();
      notify('审核结果已保存。');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function reply(v: Voice) {
    if (hasDraft()) {
      notify('请先保存或清空工作台里的草稿，再开始年轮录音。');
      navigate('studio');
      return;
    }
    setDraft({
      ...initialDraft(),
      signature: user?.nickname ?? '',
      title: `回应：${v.title}`.slice(0, 60),
      mood: '给未来的我',
      parentId: v.id,
      visibility: 'private',
      topic: v.topic === 'podcast' ? 'podcast' : '',
    });
    navigate('studio');
  }
  const filtered = voices.filter(
    (v) =>
      !query.trim() ||
      `${v.title}${v.signature}${v.transcript}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const archiveList = (
    archiveTab === 'saved'
      ? saved
      : own.filter((v) =>
          archiveTab === 'future'
            ? !!v.futureYear
            : archiveTab === 'pending'
              ? v.status === 'pending'
              : true,
        )
  ).filter((v) => year === 'all' || v.recordedAt.startsWith(year));
  const years = [...new Set(own.map((v) => v.recordedAt.slice(0, 4)))].sort().reverse();
  function card(v: Voice, archive = false) {
    const active = playing?.id === v.id;
    return (
      <article className={`voice-card ${active ? 'is-current' : ''}`} key={v.id}>
        <div className="card-top">
          <button className="title-button" onClick={() => setSelected(v)}>
            <span data-original className="original-text">
              {v.title}
            </span>
          </button>
          <button
            className="icon-button dots"
            aria-label={`查看${v.title}详情`}
            onClick={() => setSelected(v)}
          >
            ···
          </button>
        </div>
        <div className="author">
          <span className={`avatar avatar-${(v.id.length % 3) + 1}`}>
            <Icon name="leaf" size={21} />
          </span>
          <span>
            <span data-original className="original-text">
              {v.signature}
            </span>
            <span className="author-date"> · {dateLabel(v.recordedAt)}</span>
          </span>
        </div>
        {v.voiceStyle ? (
          <div className="voice-style">{v.voiceStyle} · AI 示例</div>
        ) : v.topic && getTopic(v.topic) ? (
          <button className="voice-style topic-link" onClick={() => openTopic(getTopic(v.topic!)!)}>
            # {getTopic(v.topic)!.name}
          </button>
        ) : null}
        <div className="audio-row">
          <button
            className="play-button"
            aria-label={`${active && isPlaying ? '暂停' : '播放'}${v.title}`}
            onClick={() => play(v)}
          >
            <Icon
              name={active && isPlaying ? 'pause' : 'play'}
              fill={!(active && isPlaying)}
              size={18}
            />
          </button>
          <button className="wave-button" aria-label={`播放${v.title}`} onClick={() => play(v)}>
            <Wave progress={active ? position / (audioDuration || 1) : 0} />
          </button>
          <span className="time">
            {durationLabel(active ? audioDuration || v.duration : v.duration)}
          </span>
        </div>
        {archive ? (
          <>
            <div className="archive-meta">
              <span className={`status status-${v.status}`}>
                {
                  (
                    {
                      approved: '已公开',
                      pending: '待审核',
                      private: '仅自己',
                      rejected: '审核退回',
                    } as Record<string, string>
                  )[v.status]
                }
              </span>
              {v.futureYear ? <span>写给 {v.futureYear} 年</span> : null}
              {v.parentId ? <span>未来回声</span> : null}
            </div>
            {v.reviewNote ? (
              <p className="review-note">
                审核说明：
                <span data-original className="original-text">
                  {v.reviewNote}
                </span>
              </p>
            ) : null}
            <div className="archive-actions">
              <button onClick={() => reply(v)}>录一段回应</button>
              <button
                onClick={() => {
                  fetch(v.audioUrl)
                    .then((r) => {
                      if (!r.ok) throw new Error();
                      return r.blob();
                    })
                    .then((b) =>
                      download(
                        b,
                        `${v.recordedAt}-${v.id}.${b.type.includes('wav') ? 'wav' : b.type.includes('mp4') ? 'm4a' : b.type.includes('mpeg') ? 'mp3' : b.type.includes('ogg') ? 'ogg' : 'webm'}`,
                      ),
                    )
                    .catch(() => notify('下载失败，请重试。'));
                }}
              >
                下载
              </button>
              {v.visibility === 'public' ? (
                <button onClick={() => hide(v)}>转为私密</button>
              ) : (
                <button disabled={busy} onClick={() => void requestPublication(v)}>
                  申请公开
                </button>
              )}
              <button className="danger" onClick={() => remove(v)} aria-label={`删除${v.title}`}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          </>
        ) : (
          <div className="card-bottom">
            <button className={v.loved ? 'loved' : ''} onClick={() => react(v, 'heart')}>
              <Icon name="heart" size={19} fill={v.loved} />
              <span>给了我力量{v.hearts ? ` · ${v.hearts}` : ''}</span>
            </button>
            <button className={v.saved ? 'saved' : ''} onClick={() => react(v, 'save')}>
              <Icon name="save" size={18} fill={v.saved} />
              <span>{v.saved ? '已收藏' : '收藏'}</span>
            </button>
          </div>
        )}
      </article>
    );
  }
  const login = (
    <button className="button primary" onClick={openAuth}>
      登录并建立声音档案 <Icon name="arrow" />
    </button>
  );

  return (
    <LocalizedView>
      {
        <>
          <header className="header">
            <button className="brand" onClick={() => navigate('wall')}>
              <Icon name="sun" size={35} />
              <span>
                一点光
                <small className="brand-english">
                  {locale === 'en' ? 'Voices & time' : 'A Glimmer'}
                </small>
              </span>
            </button>
            <nav aria-label="主导航">
              {(['wall', 'podcast', 'inspiration', 'archive'] as View[]).map((v, i) => (
                <button
                  key={v}
                  className={
                    view === v ||
                    (view === 'topic' && v === 'wall') ||
                    (view === 'quotes' && v === 'inspiration')
                      ? 'current'
                      : ''
                  }
                  onClick={() => navigate(v)}
                >
                  {['声音墙', '慢慢听', '灵感信箱', '我的声音'][i]}
                </button>
              ))}
            </nav>
            <div className="header-actions">
              <PreferencesMenu />
              {user ? (
                <button
                  className="user-button"
                  onClick={() => navigate('archive')}
                  aria-label="打开我的账户"
                >
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={t('头像')} />
                  ) : (
                    <span data-original>{user.nickname.slice(0, 1)}</span>
                  )}
                </button>
              ) : (
                <button className="login-link" onClick={openAuth}>
                  登录 / 注册
                </button>
              )}
              <button className="button outline small" onClick={() => navigate('studio')}>
                <Icon name="mic" size={17} />
                <span>留下一点光</span>
              </button>
            </div>
          </header>
          <main>
            {view === 'wall' ? (
              <>
                <section className="hero">
                  <div className="hero-copy">
                    <h1>
                      每个声音里，
                      <br />
                      都有一点光。
                    </h1>
                    <p className="hero-slogan" lang="en">
                      A little light, in every voice.
                    </p>
                    <p>
                      在这里，听见陌生人的善意，
                      <br />
                      也留下此刻的你。
                    </p>
                    {voices[0] ? (
                      <div className="hero-feature">
                        <button
                          className="play-button"
                          aria-label={t('播放')}
                          onClick={() => void play(voices[0])}
                        >
                          <Icon
                            name={playing?.id === voices[0].id && isPlaying ? 'pause' : 'play'}
                            fill
                          />
                        </button>
                        <div>
                          <strong data-original>{voices[0].title}</strong>
                          <small>
                            <span data-original>{voices[0].signature}</span> ·{' '}
                            {dateLabel(voices[0].recordedAt)} · {durationLabel(voices[0].duration)}
                          </small>
                        </div>
                      </div>
                    ) : null}
                    <div className="hero-actions">
                      <button className="button primary" onClick={randomPlay}>
                        <Icon name="play" fill size={18} />
                        听一段给我的声音
                      </button>
                      <button className="button outline" onClick={() => navigate('studio')}>
                        <Icon name="mic" size={19} />
                        留下我的声音
                      </button>
                    </div>
                  </div>
                  <Landscape />
                </section>
                <FeaturedListening onExplore={() => navigate('quotes')} />
                <section className="wall-section">
                  {voices[0] && canMakePostcard(voices[0]) ? (
                    <div className="postcard-invite">
                      <div>
                        <span className="handwritten">声音明信片</span>
                        <h2>让一句话，有一个值得收藏的模样。</h2>
                        <p>署名、日期和声音，送给此刻的自己。</p>
                      </div>
                      <button className="button outline" onClick={() => setPostcard(voices[0])}>
                        制作声音明信片 <Icon name="arrow" size={18} />
                      </button>
                    </div>
                  ) : null}
                  <GentleListening
                    voices={voices}
                    playingId={playing?.id}
                    onPlay={(v) => void play(v)}
                  />
                  <div className="podcast-invite">
                    <div>
                      <span className="handwritten">今晚，慢慢听</span>
                      <h2>让一个故事，陪你结束今天。</h2>
                      <p>长声音与睡前小故事，留给不用赶路的时间。</p>
                    </div>
                    <button className="button outline" onClick={() => navigate('podcast')}>
                      打开故事书架 →
                    </button>
                  </div>
                  <section className="topic-discovery" aria-label="主题公共频道">
                    <div className="section-heading">
                      <div>
                        <h2>找一个话题，遇见同频的人</h2>
                        <p className="topic-intro">
                          有时需要一句鼓励，有时只想随便聊聊。挑一个频道坐坐。
                        </p>
                      </div>
                      <span className="topic-types">语音 / 文字 / 图片</span>
                    </div>
                    <div className="topic-grid">
                      {TOPICS.map((t) => (
                        <article key={t.id} className={`topic-card theme-${t.color}`}>
                          <div className="topic-card-top">
                            <span className="topic-label">
                              <Icon name={t.icon} size={16} />
                              {t.label}
                            </span>
                            <span className="topic-count">
                              {topicCounts === null
                                ? '正在打开频道…'
                                : topicCounts[t.id]
                                  ? `${topicCounts[t.id]} 条公开留言`
                                  : '等你来打个招呼'}
                            </span>
                          </div>
                          <button className="topic-title" onClick={() => openTopic(t)}>
                            {t.question}
                          </button>
                          <p>{t.description}</p>
                          <div className="topic-card-bottom">
                            <span>{t.name}</span>
                            <button aria-label={`进入${t.name}`} onClick={() => openTopic(t)}>
                              进入频道 <Icon name="arrow" size={17} />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                    {topicError ? (
                      <p className="small-note" role="status">
                        {topicError}
                      </p>
                    ) : null}
                  </section>
                  <div className="mood-row">
                    <h2>今天的你，需要哪一种陪伴？</h2>
                    <div className="chips">
                      <button className={!mood ? 'selected' : ''} onClick={() => setMood('')}>
                        全部
                      </button>
                      {MOODS.map((m) => (
                        <button
                          key={m}
                          className={mood === m ? 'selected' : ''}
                          onClick={() => {
                            setMood(m);
                            if (m === '给未来的我') setMode('all');
                          }}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="section-heading">
                    <h2>为你留的声音</h2>
                    <div className="wall-tools">
                      <input
                        aria-label="搜索声音"
                        type="search"
                        maxLength={100}
                        placeholder="找一句想听的话"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      <select
                        aria-label="声音列表"
                        value={mode}
                        onChange={(e) => setMode(e.target.value)}
                      >
                        <option value="featured">精选 · 慢慢听</option>
                        <option value="all">全部公开声音</option>
                      </select>
                    </div>
                  </div>
                  {error ? (
                    <div className="empty">
                      <h3>声音暂时还没到达</h3>
                      <p>{error}</p>
                      <button className="button outline" onClick={loadWall}>
                        再试一次
                      </button>
                    </div>
                  ) : loading ? (
                    <div className="loading" role="status">
                      正在寻找一点光…
                    </div>
                  ) : filtered.length ? (
                    <div className="voice-grid">{filtered.map((v) => card(v))}</div>
                  ) : (
                    <div className="empty">
                      <Icon name="leaf" size={30} />
                      <h3>这一页，等你留下一点光</h3>
                      <p>
                        {query
                          ? '换一个关键词试试。'
                          : '这个心情暂时还没有声音。也许你会是第一个。'}
                      </p>
                      <button className="button outline" onClick={() => navigate('studio')}>
                        留下我的声音
                      </button>
                    </div>
                  )}
                  {voices.some((v) => v.demo) ? (
                    <p className="demo-note">真实投稿经审核后展示；网络经典请在声音灵感馆收听。</p>
                  ) : null}
                  {!loading && wallCursor ? (
                    <div className="load-more">
                      <button
                        className="button outline"
                        disabled={wallMoreLoading}
                        onClick={() => void loadMoreVoices()}
                      >
                        {wallMoreLoading ? '正在寻找更多声音…' : '再听一些声音'}
                      </button>
                    </div>
                  ) : null}
                  <section className="future-banner">
                    <div>
                      <h2>给十年后的你，留一封声音信。</h2>
                      <p>此刻的心情、困惑、期待……让未来的你，听见现在的自己。</p>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => {
                        if (!hasDraft()) {
                          setDraft({
                            ...initialDraft(),
                            signature: user?.nickname ?? '',
                            mood: '给未来的我',
                            visibility: 'private',
                            futureYear: String(new Date().getUTCFullYear() + 10),
                          });
                        } else notify('请先保存或清空工作台里的草稿，再开始年轮录音。');
                        navigate('studio');
                      }}
                    >
                      <Icon name="mail" />
                      写给未来
                    </button>
                    <div className="envelope" aria-hidden="true">
                      <Icon name="sun" size={40} />
                    </div>
                  </section>
                  <div className="quiet-note">
                    <Icon name="headphones" size={18} />
                    <span>不必很会表达。真实的声音，就已经很珍贵。</span>
                    <button onClick={() => navigate('about')}>
                      关于这里 <Icon name="arrow" size={16} />
                    </button>
                  </div>
                </section>
              </>
            ) : null}
            {view === 'topic' ? (
              getTopic(topicId) ? (
                <TopicChannel
                  key={topicId}
                  topic={getTopic(topicId)!}
                  user={user}
                  onLogin={openAuth}
                  onBack={() => navigate('wall')}
                  onPlay={(v) => {
                    void play(v);
                  }}
                  onOpen={setSelected}
                  playing={playing}
                  isPlaying={isPlaying}
                />
              ) : (
                <section className="page-section empty">
                  <h2>选择一个想聊的话题</h2>
                  <button className="button outline" onClick={() => navigate('wall')}>
                    回到首页选频道
                  </button>
                </section>
              )
            ) : null}
            {view === 'podcast' ? (
              <>
                <QuoteLibrary collection="long" onStart={startFromQuote} />
                <PodcastShelf
                  onPlay={(v, list) => listening.start((list ?? [v]).map(voiceListeningItem), v.id)}
                  onCreate={createPodcast}
                  onDetails={setSelected}
                  playingId={listening.current?.id}
                  timer={sleepMinutes}
                  onTimer={(minutes) => {
                    sleepDeadline.current = Date.now() + minutes * 60000;
                    setSleepMinutes(minutes);
                  }}
                />
              </>
            ) : null}
            {view === 'inspiration' ? (
              <section className="page-section">
                <div className="page-heading">
                  <h1>灵感信箱</h1>
                  <p>不用讲大道理。从一件小事、一段经历、一句真心话开始。</p>
                </div>
                <div className="inspiration-feature">
                  <div>
                    <span className="handwritten">给不知道说什么的你</span>
                    <h2>
                      想象有一个人，
                      <br />
                      今天过得不太顺。
                    </h2>
                    <p>
                      你愿意用一分钟，对他说些什么？
                      <br />
                      不用让他马上振作，让他知道有人理解就好。
                    </p>
                    <button
                      className="button primary"
                      onClick={() => {
                        const i = (promptIndex + 1) % PROMPTS.length;
                        setPromptIndex(i);
                        notify(`抽到一张：${PROMPTS[i].title}`);
                      }}
                    >
                      <Icon name="shuffle" />
                      抽一张灵感卡
                    </button>
                  </div>
                  <div className="prompt-paper">
                    <Icon name="mail" size={30} />
                    <h3>{PROMPTS[promptIndex].title}</h3>
                    <p>{PROMPTS[promptIndex].text}</p>
                    <button className="text-button" onClick={() => choosePrompt(promptIndex)}>
                      用这张卡开始 <Icon name="arrow" />
                    </button>
                  </div>
                </div>
                <div className="section-heading">
                  <h2>总有一句话，适合此刻的你</h2>
                </div>
                <div className="classic-invite">
                  <h2>也可以从一句经典开始。</h2>
                  <p>收听网络经典与官方演讲，带着出处，把共鸣讲成自己的故事。</p>
                  <button className="button outline" onClick={() => navigate('quotes')}>
                    探索双语灵感馆 <Icon name="arrow" size={17} />
                  </button>
                </div>
                <div className="prompt-grid">
                  {PROMPTS.map((p, i) => (
                    <button className="prompt-card" key={p.title} onClick={() => choosePrompt(i)}>
                      <span className="prompt-number">0{i + 1}</span>
                      <h3>{p.title}</h3>
                      <p>{p.text}</p>
                      <span className="text-button">
                        从这里开始 <Icon name="arrow" size={17} />
                      </span>
                    </button>
                  ))}
                </div>
                <div className="guideline">
                  <Icon name="leaf" />
                  <p>
                    <strong>把素材变成你自己的话。</strong>
                    分享具体经历，不必承诺“一切都会好”。允许难过，也尊重每个人的节奏。引用别人的文字时，请留下出处。
                  </p>
                </div>
              </section>
            ) : null}
            {view === 'quotes' ? (
              <QuoteLibrary
                onStart={startFromQuote}
                onPlay={(v) => void play(v)}
                playingId={playing?.id}
                isPlaying={isPlaying}
              />
            ) : null}
            {view === 'studio' ? (
              <section className="page-section">
                <div className="page-heading">
                  <button className="text-button" onClick={() => navigate('wall')}>
                    <Icon name="back" size={17} />
                    回到声音墙
                  </button>
                  <h1>{draft.topic === 'podcast' ? '分享一段长声音' : '留下此刻的你'}</h1>
                  <p>今天有人会听见，未来的你也会。</p>
                </div>
                {legacyDraftAvailable ? (
                  <button
                    className="text-button"
                    disabled={recording || busy || !draftLoaded}
                    onClick={() => void restoreLegacyDraft()}
                  >
                    恢复升级前的本机草稿
                  </button>
                ) : null}
                {submitMessage ? (
                  <div className="success-panel" role="status">
                    <Icon name="check" size={40} />
                    <h2>你的一点光，已经留下。</h2>
                    <p>{submitMessage}</p>
                    <button className="button primary" onClick={() => navigate('archive')}>
                      去我的声音档案
                    </button>
                    <button className="text-button" onClick={() => setSubmitMessage('')}>
                      再留一段
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="studio-steps">
                      <button
                        className={studioStep === 1 ? 'selected' : ''}
                        onClick={() => setStudioStep(1)}
                      >
                        1 · 录音与试听
                      </button>
                      <button
                        className={studioStep === 2 ? 'selected' : ''}
                        disabled={!blob || recording}
                        onClick={() => {
                          if (blob) setStudioStep(2);
                          else notify('录好后进入下一步');
                        }}
                      >
                        2 · 署名与可见范围
                      </button>
                    </div>
                    <div className="studio-grid" data-step={studioStep}>
                      <aside className="studio-inspiration">
                        <Icon name="mail" size={27} />
                        <h2>灵感信箱</h2>
                        <p>
                          不知道说什么？
                          <br />
                          从一句话开始。
                        </p>
                        {PROMPTS.slice(0, 4).map((p, i) => (
                          <button
                            key={p.title}
                            className={`studio-prompt ${i === promptIndex ? 'chosen' : ''}`}
                            onClick={() => {
                              setPromptIndex(i);
                              update('mood', p.mood);
                            }}
                          >
                            <h3>{p.title}</h3>
                            <p>{p.text}</p>
                          </button>
                        ))}
                        <p className="small-note">
                          这些是表达的起点。
                          <br />
                          你的经历，才是最好的素材。
                        </p>
                      </aside>
                      <div className="studio-panel">
                        <div className="panel-heading">
                          <h2>录音工作台</h2>
                          <span>01 / 留下声音</span>
                        </div>
                        {draft.parentId ? (
                          <p className="reply-note">这段回应会与当年的声音并排保存在你的档案里。</p>
                        ) : null}
                        <div className="recording-guide">
                          <strong>
                            {draft.topic === 'podcast'
                              ? '让故事有一个温柔的起点'
                              : '不需要一遍说好'}
                          </strong>
                          <p>
                            {draft.topic === 'podcast'
                              ? '先介绍故事，再慢慢展开，最后留一句晚安。建议提前录好并试听，控制音量，注明原创或朗读授权。'
                              : '先想一个具体的人，说一件真实的小事，再留下一句陪伴。录好可以试听、重录，草稿会留在当前浏览器。'}
                          </p>
                        </div>
                        <div className={`recorder ${recording ? 'recording' : ''}`}>
                          <div className="mic-orb">
                            <Icon name="mic" size={33} />
                          </div>
                          <div className="record-time">
                            {durationLabel(recording ? recordSeconds : duration)}
                          </div>
                          <p>
                            {recording
                              ? '正在听你说。准备好了，就按结束。'
                              : blob
                                ? '已经录好，先听听自己的声音。'
                                : draft.topic === 'podcast'
                                  ? '请上传 1–30 分钟、30 MB 以内的音频。'
                                  : '最长 90 秒，真实的声音就很好。'}
                          </p>
                          {blobUrl && !recording ? (
                            <audio
                              controls
                              src={blobUrl}
                              preload="metadata"
                              aria-label="试听录音草稿"
                              onPlay={() => {
                                audioRef.current?.pause();
                                window.speechSynthesis?.cancel();
                                setIsPlaying(false);
                              }}
                            />
                          ) : null}
                          <div className="record-actions">
                            <button
                              className={`button ${recording ? 'record-stop' : 'primary'}`}
                              disabled={!draftLoaded || draft.topic === 'podcast'}
                              onClick={recording ? stopRecording : startRecording}
                            >
                              <Icon name={recording ? 'pause' : 'mic'} />
                              {draft.topic === 'podcast'
                                ? '长内容请上传录音'
                                : recording
                                  ? '结束录音'
                                  : blob
                                    ? '重新录音'
                                    : '开始录音'}
                            </button>
                            <button
                              className="text-button"
                              disabled={recording || !draftLoaded}
                              onClick={() => uploadRef.current?.click()}
                            >
                              <Icon name="upload" size={17} />
                              上传已有录音
                            </button>
                          </div>
                          <input
                            hidden
                            ref={uploadRef}
                            type="file"
                            accept="audio/*,.webm,.m4a,.mp4,.mp3,.wav,.ogg"
                            onChange={(e) => upload(e.target.files?.[0])}
                          />
                          {blob ? (
                            <button
                              className="text-button draft-download"
                              onClick={() =>
                                download(
                                  blob,
                                  `一点光-草稿.${blob.type.includes('mp4') ? 'm4a' : blob.type.includes('wav') ? 'wav' : blob.type.includes('mpeg') ? 'mp3' : blob.type.includes('ogg') ? 'ogg' : 'webm'}`,
                                )
                              }
                            >
                              下载这段草稿
                            </button>
                          ) : null}
                          {!draftLoaded ? <p role="status">正在恢复此账户的草稿…</p> : null}
                          {hasDraft() ? (
                            <button
                              className="text-button danger"
                              disabled={recording || busy || !draftLoaded}
                              onClick={() => void discardDraft()}
                            >
                              清空工作台草稿
                            </button>
                          ) : null}
                        </div>
                        <button
                          className="button primary studio-next"
                          disabled={!blob || recording}
                          onClick={() => setStudioStep(2)}
                        >
                          下一步，保存这段声音 <Icon name="arrow" size={18} />
                        </button>
                        <div className="panel-heading form-heading">
                          <h2>给声音一个时间坐标</h2>
                          <span>02 / 记住此刻</span>
                        </div>
                        <div className="form-grid">
                          <label className="full">
                            声音标题 <span>{draft.title.length}/60</span>
                            <input
                              maxLength={60}
                              placeholder="给正在听的人，一句温柔的开场"
                              value={draft.title}
                              onChange={(e) => update('title', e.target.value)}
                            />
                          </label>
                          <label>
                            此刻的署名
                            <input
                              maxLength={24}
                              placeholder="不必用真实姓名"
                              value={draft.signature}
                              onChange={(e) => update('signature', e.target.value)}
                            />
                          </label>
                          <label>
                            录制日期
                            <input
                              type="date"
                              value={draft.recordedAt}
                              max={today()}
                              onChange={(e) => update('recordedAt', e.target.value)}
                            />
                          </label>
                          <label className="full">
                            想陪伴谁？
                            <select
                              value={draft.mood}
                              onChange={(e) => update('mood', e.target.value)}
                            >
                              {MOODS.map((m) => (
                                <option key={m}>{m}</option>
                              ))}
                            </select>
                          </label>
                          <details className="full extra-record">
                            <summary>更多记录信息</summary>
                            <div className="optional-fields">
                              {' '}
                              <label className="full">
                                投稿到哪个主题？<span>可选</span>
                                <select
                                  value={draft.topic ?? ''}
                                  onChange={(e) => update('topic', e.target.value)}
                                >
                                  <option value="">不选主题 · 普通声音墙</option>
                                  {TOPICS.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}
                                    </option>
                                  ))}
                                  <option value="podcast">慢慢听 · 长内容播客</option>
                                </select>
                                {draft.topic && getTopic(draft.topic) ? (
                                  <p className="small-note">{getTopic(draft.topic)!.prompt}</p>
                                ) : null}
                              </label>
                              <label className="full">
                                文字稿 <span>可选 · 方便安静阅读</span>
                                <textarea
                                  rows={3}
                                  maxLength={draft.topic === 'podcast' ? 15000 : 3000}
                                  placeholder={
                                    draft.topic === 'podcast'
                                      ? '写下节目介绍或全文。可用 [00:00] 开场、[02:15] 第一章 这样的独立行标记章节。'
                                      : '可以把你说的话写下来。第一版不会自动转写。'
                                  }
                                  value={draft.transcript}
                                  onChange={(e) => update('transcript', e.target.value)}
                                />
                              </label>
                              <label className="full">
                                引用出处 <span>引用他人文字时填写</span>
                                <input
                                  maxLength={300}
                                  placeholder="原创可以留空；引用请注明作者与来源"
                                  value={draft.source}
                                  onChange={(e) => update('source', e.target.value)}
                                />
                              </label>
                              <div className="full future-field">
                                <span className="field-label">
                                  留给哪一年的自己？ <small>可选</small>
                                </span>
                                <div className="chips">
                                  <button
                                    className={!draft.futureYear ? 'selected' : ''}
                                    onClick={() => update('futureYear', '')}
                                  >
                                    只记住今天
                                  </button>
                                  {[10, 20].map((n) => (
                                    <button
                                      key={n}
                                      className={
                                        draft.futureYear === String(new Date().getFullYear() + n)
                                          ? 'selected'
                                          : ''
                                      }
                                      onClick={() =>
                                        update('futureYear', String(new Date().getFullYear() + n))
                                      }
                                    >
                                      {new Date().getFullYear() + n} · {n} 年后
                                    </button>
                                  ))}
                                </div>
                                <p className="small-note">
                                  声音现在即可重听。目标年份会记在档案中，暂不发送定时邮件。
                                </p>
                              </div>
                            </div>
                          </details>{' '}
                          <fieldset className="full visibility">
                            <legend>谁可以听见？</legend>
                            <label>
                              <input
                                type="radio"
                                name="visibility"
                                checked={draft.visibility === 'public'}
                                onChange={() => update('visibility', 'public')}
                              />
                              公开，审核后给陌生人力量
                            </label>
                            <label>
                              <input
                                type="radio"
                                name="visibility"
                                checked={draft.visibility === 'private'}
                                onChange={() => update('visibility', 'private')}
                              />
                              仅自己可见，留在我的档案
                            </label>
                          </fieldset>
                          <label className="full consent">
                            <input
                              type="checkbox"
                              checked={consent}
                              onChange={(e) => setConsent(e.target.checked)}
                            />
                            <span>
                              我拥有这段录音的发布权，理解公开内容可被他人听见，并同意{' '}
                              <button className="inline-link" onClick={() => navigate('about')}>
                                保存与社区规则
                              </button>
                              。
                            </span>
                          </label>
                        </div>
                        <button
                          className="text-button studio-back"
                          onClick={() => setStudioStep(1)}
                        >
                          返回试听
                        </button>
                        <div className="submit-row">
                          <p>
                            <Icon name="clock" size={17} />
                            当年的署名与日期，会随原录音保存。
                          </p>
                          <button
                            className="button primary"
                            disabled={busy || recording}
                            onClick={submit}
                          >
                            {busy ? '正在保存…' : user ? '保存这段声音' : '登录并保存声音'}
                            <Icon name="arrow" size={18} />
                          </button>
                        </div>
                        <p className="small-note">
                          录好的草稿会保存在当前浏览器，发布前请勿清理浏览器数据。登录后会返回这里。
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </section>
            ) : null}
            {view === 'archive' ? (
              <section className="page-section">
                <div className="page-heading">
                  <h1>我的声音年鉴</h1>
                  <p>多年以后，再听听此刻的自己。</p>
                </div>
                {!meLoaded ? (
                  <div className="loading">正在打开你的档案…</div>
                ) : !user ? (
                  <div className="account-empty">
                    <Icon name="clock" size={48} />
                    <h2>给时间，留一个能回来的地址。</h2>
                    <p>
                      登录后建立你的声音档案。保存原录音、当年的署名和日期，
                      <br />
                      也可以把它们完整下载，放在自己手里。
                    </p>
                    {login}
                    <p className="small-note">邮箱验证码登录 · 第一次登录会自动建立档案</p>
                  </div>
                ) : (
                  <>
                    <div className="archive-profile">
                      <div className="profile-icon">
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt={t('头像')} />
                        ) : (
                          <span data-original>{user.nickname.slice(0, 1)}</span>
                        )}
                      </div>
                      <div>
                        <h2>
                          <span data-original className="original-text">
                            {user.nickname}
                          </span>
                          的声音档案
                        </h2>
                        <p>{own.length} 段声音 · 每一段，都是那时的你</p>
                      </div>
                      <button
                        className="button outline"
                        disabled={exporting}
                        onClick={exportArchive}
                      >
                        <Icon name="download" size={18} />
                        {exporting ? '正在整理档案…' : '完整导出档案'}
                      </button>
                    </div>
                    <details className="account-config">
                      <summary>账户设置</summary>{' '}
                      <AvatarSettings
                        avatarUrl={user.avatarUrl}
                        nickname={user.nickname}
                        onChanged={async () => {
                          await loadMe(true);
                        }}
                      />
                      <div className="account-settings">
                        <div>
                          <h3>下次想用什么署名？</h3>
                          <p>修改只影响新录音，过去的署名会保留。</p>
                        </div>
                        <input
                          aria-label="新的署名"
                          maxLength={24}
                          value={nickname}
                          onChange={(e) => setNickname(e.target.value)}
                        />
                        <button className="button outline small" onClick={saveNickname}>
                          保存署名
                        </button>
                      </div>
                      <AccountClosure userId={user.userId} administrator={user.admin} />
                    </details>
                    <AnnualRecap
                      key={user.userId}
                      voices={own}
                      onPlay={(v) => void play(v)}
                      onOpen={setSelected}
                    />
                    <VoiceRings
                      voices={own}
                      onPlay={(v) => void play(v)}
                      onStart={(question, previous) => {
                        if (hasDraft()) {
                          notify('请先保存或清空工作台里的草稿，再开始年轮录音。');
                          navigate('studio');
                          return;
                        }
                        setDraft({
                          ...initialDraft(),
                          signature: user.nickname,
                          title: question,
                          mood: '给未来的我',
                          visibility: 'private',
                          parentId: previous?.id ?? '',
                        });
                        navigate('studio');
                      }}
                    />
                    <div className="archive-toolbar">
                      <div className="chips">
                        {[
                          ['all', '全部声音'],
                          ['future', '给未来的我'],
                          ['pending', '待审核'],
                          ['saved', '我的收藏'],
                        ].map(([k, v]) => (
                          <button
                            key={k}
                            className={archiveTab === k ? 'selected' : ''}
                            onClick={() => setArchiveTab(k)}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                      <select
                        aria-label="筛选录制年份"
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                      >
                        <option value="all">所有年份</option>
                        {years.map((y) => (
                          <option key={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                    {archiveList.length ? (
                      <div className="voice-grid archive-grid">
                        {archiveList.map((v) => card(v, archiveTab !== 'saved'))}
                      </div>
                    ) : (
                      <div className="empty">
                        <Icon name="mail" size={36} />
                        <h3>
                          {archiveTab === 'saved'
                            ? '收藏一句，让你有力量的话'
                            : '这一年的你，还没有留下声音'}
                        </h3>
                        <p>不需要等到特别的日子。一个普通的今天，也值得被记住。</p>
                        <button
                          className="button primary"
                          onClick={() => navigate(archiveTab === 'saved' ? 'wall' : 'studio')}
                        >
                          {archiveTab === 'saved' ? '去听一段声音' : '留下第一段声音'}
                        </button>
                      </div>
                    )}
                    <div className="archive-links">
                      {user.admin ? (
                        <button onClick={() => navigate('admin')}>
                          <Icon name="shield" size={17} />
                          审核工作台
                        </button>
                      ) : null}
                      <button onClick={() => navigate('about')}>长期保存说明</button>
                      <button onClick={logout}>退出登录</button>
                    </div>
                  </>
                )}
              </section>
            ) : null}
            {view === 'admin' ? (
              <section className="page-section">
                <div className="page-heading">
                  <h1>为善意，认真把关</h1>
                  <p>先完整听一遍，再判断是否适合公开与首页精选。</p>
                </div>
                {!user?.admin ? (
                  <div className="empty">
                    <h2>这里需要审核员权限</h2>
                    <p>管理员通过服务端白名单设置，普通账户不能进入。</p>
                  </div>
                ) : (
                  <>
                    <div className="guideline">
                      <Icon name="shield" />
                      <p>
                        精选标准：真诚具体、尊重情绪、听感清楚、不营销、不攻击、不作不切实际的承诺。公开不代表精选，首页推荐需要单独决定。
                      </p>
                    </div>
                    <h2 className="admin-heading">声音审核 · {adminPending.voices} 段待处理</h2>
                    <div className="admin-filter">
                      <label>
                        审核状态
                        <select
                          aria-label="审核状态"
                          value={adminStatus}
                          disabled={busy}
                          onChange={(e) => {
                            setAdminStatus(e.target.value);
                            setAdminPages({ voices: 0, messages: 0, reports: 0 });
                          }}
                        >
                          <option value="all">全部状态</option>
                          <option value="pending">待审核</option>
                          <option value="approved">已通过</option>
                          <option value="rejected">已退回</option>
                        </select>
                      </label>
                      <button
                        className="button outline small"
                        disabled={adminLoading || busy}
                        onClick={() => void loadAdmin()}
                      >
                        刷新审核队列
                      </button>
                    </div>
                    {adminLoading ? <p role="status">正在读取审核队列…</p> : null}
                    {adminError ? <p role="alert">{adminError}</p> : null}
                    {adminVoices.length ? (
                      adminVoices.map((v) => (
                        <div className="admin-row" key={v.id}>
                          <div>
                            {card(v)}
                            <p className="small-note">
                              状态：{v.status} · {v.featured ? '首页精选' : '未精选'}
                            </p>
                            <p className="admin-transcript">
                              <span data-original={!!v.transcript}>
                                {v.transcript || '未填写文字稿，请听取原音频。'}
                              </span>
                            </p>
                          </div>
                          <div className="review-controls">
                            <label>
                              审核说明
                              <textarea
                                placeholder="退回时必须说明原因"
                                maxLength={300}
                                value={reviewNotes[v.id] ?? ''}
                                onChange={(e) =>
                                  setReviewNotes((n) => ({ ...n, [v.id]: e.target.value }))
                                }
                              />
                            </label>
                            <button
                              className="button primary"
                              disabled={busy}
                              onClick={() => review(v.id, 'feature')}
                            >
                              通过并首页精选
                            </button>
                            <button
                              className="button outline"
                              disabled={busy}
                              onClick={() => review(v.id, 'approve')}
                            >
                              仅通过公开
                            </button>
                            <button
                              className="text-button danger"
                              disabled={busy}
                              onClick={() => review(v.id, 'reject')}
                            >
                              退回并说明原因
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="empty">暂时没有投稿，等待第一点光。</div>
                    )}
                    {adminPager('voices')}
                    <h2 className="admin-heading">
                      频道文字与图片 · {adminPending.messages} 条待处理
                    </h2>
                    {adminMessages.length ? (
                      adminMessages.map((m) => (
                        <div className="admin-row" key={m.id}>
                          <div>
                            <p className="small-note">
                              #{getTopic(m.topic)?.name ?? m.topic} ·{' '}
                              <span data-original className="original-text">
                                {m.signature}
                              </span>{' '}
                              · {m.status}
                            </p>
                            <p className="admin-transcript">
                              <span data-original={!!m.body}>{m.body || '图片消息'}</span>
                            </p>
                            {m.kind === 'image' ? (
                              <img
                                className="admin-message-image"
                                src={`/api/messages/${m.id}/media`}
                                alt="待审核频道图片"
                              />
                            ) : null}
                          </div>
                          <div className="review-controls">
                            <label>
                              审核说明
                              <textarea
                                maxLength={300}
                                value={reviewNotes[m.id] ?? ''}
                                onChange={(e) =>
                                  setReviewNotes((n) => ({ ...n, [m.id]: e.target.value }))
                                }
                              />
                            </label>
                            <button
                              className="button primary"
                              disabled={busy}
                              onClick={() => review(m.id, 'approve', 'message')}
                            >
                              通过并公开
                            </button>
                            <button
                              className="text-button danger"
                              disabled={busy}
                              onClick={() => review(m.id, 'reject', 'message')}
                            >
                              退回并说明原因
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="small-note">暂时没有频道消息。</p>
                    )}
                    {adminPager('messages')}
                    <h2 className="admin-heading">收到的举报</h2>
                    {reports.length ? (
                      reports.map((r) => (
                        <div className="report-row" key={r.id}>
                          <div>
                            <strong>
                              <span data-original={!!r.title}>{r.title ?? '声音已删除'}</span>
                            </strong>
                            <p>
                              <span data-original>{r.reason}</span>
                            </p>
                          </div>
                          {String(r.voice_id).startsWith('quote:') ? (
                            <button
                              className="button outline small"
                              onClick={() =>
                                review(
                                  String(r.voice_id).slice(6),
                                  r.classicHidden ? 'restore_classic' : 'hide_classic',
                                )
                              }
                            >
                              {r.classicHidden ? '恢复素材展示' : '暂停素材展示'}
                            </button>
                          ) : null}
                          <button
                            className="button outline small"
                            onClick={() => review(r.id, 'resolve')}
                          >
                            标记已处理
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="small-note">目前没有未处理的举报。</p>
                    )}
                    {adminPager('reports')}
                    <AdminOperations currentUserId={user.userId} />
                  </>
                )}
              </section>
            ) : null}
            {view === 'about' ? (
              <section className="page-section about">
                <div className="page-heading">
                  <h1>让善意留下，也让时间留下。</h1>
                  <p>一点光的社区与保存约定</p>
                </div>
                <section>
                  <h2>这里欢迎什么样的声音？</h2>
                  <p>
                    真实的经历、温柔的陪伴、具体的小建议。允许难过，尊重每个人的节奏。请勿发布攻击、歧视、广告、他人的隐私或无权发布的音频。引用文字请注明来源。
                  </p>
                  <p>
                    公开投稿先经人工审核；首页由审核员另外精选。收藏与“给了我力量”不是首页排名依据。觉得内容不合适时，可在详情中举报。
                  </p>
                </section>
                <section>
                  <h2>署名与时间，是声音的一部分。</h2>
                  <p>
                    保存时固定当次署名和录制日期。上传旧录音的录制日期由用户填写，发布日期由服务器记录，两者独立保存。修改个人昵称不会修改过去的署名。未来回应是一段新录音，不覆盖原录音。
                  </p>
                </section>
                <section>
                  <h2>关于十年、二十年的保存。</h2>
                  <p>
                    声音与元数据分别存储在服务端对象存储和数据库中，可跨设备访问。我们不承诺永久保存；长期运营需要持续维护与备份。请定期使用完整导出功能，把原音频、文字稿、署名与日期保存在自己的设备，并另存一份备份。
                  </p>
                  <p>
                    未来年份是档案标记，不会把声音锁到那一年；第一版不发送定时邮件。若服务计划停止，应提前公告，并提供至少
                    90 天的导出窗口。
                  </p>
                  <p>
                    你可以在录音详情下载日历回听提醒，主动加入自己的日历；也可以下载声音年记和带逐文件
                    SHA-256 校验清单的完整档案。提醒由你的日历应用管理。
                  </p>
                </section>
                <section>
                  <h2>经典素材的出处与权利。</h2>
                  <p>
                    声音灵感馆整理已有的诗词朗读、官方演讲与电影独白，公版录音连接来源文件播放，官方演讲保留视频播放器，不转存或剪辑音轨。中英文为本站导读或公版原句的自主意译，不代表官方字幕。LibriVox
                    的公有领域声明以美国为依据，其他地区可能不同。每条素材保留来源与使用说明；版权或出处问题可直接反馈，审核员可以暂停展示并核对。
                  </p>
                </section>
                <section>
                  <h2>你可以控制自己的声音。</h2>
                  <p>
                    可选择公开或仅自己可见，公开声音可随时转为私密；可以下载、完整导出或删除。公开音频在技术上可能被听众另行录制或保存，请不要录入敏感身份信息。删除后内容立即停止在本站提供，历史备份的清理按运营备份周期处理。
                  </p>
                  <p>
                    每个账户最多保存 200 段、共 500 MB，每小时最多提交 10 段，短声音每段最长 90
                    秒、最大 10 MB；播客为 1–30 分钟、最大 30
                    MB。录音草稿只保存在当前浏览器，清理数据会移除草稿。
                  </p>
                </section>
                <button className="button primary" onClick={() => navigate('studio')}>
                  留下我的声音 <Icon name="arrow" />
                </button>
              </section>
            ) : null}
          </main>
          <footer>
            <button className="brand footer-brand" onClick={() => navigate('wall')}>
              <Icon name="sun" size={25} />
              <span>
                一点光
                <small className="brand-english">
                  {locale === 'en' ? 'Voices & time' : 'A Glimmer'}
                </small>
              </span>
            </button>
            <p className="footer-slogan">
              每个声音里，都有一点光。<span lang="en">A little light, in every voice.</span>
            </p>
            <button onClick={() => navigate('about')}>社区与保存约定</button>
          </footer>
          <audio
            ref={audioRef}
            preload="none"
            onPlay={(e) => {
              window.dispatchEvent(new Event('glimmer:audio-play'));
              if (sleepMinutes > 0 && Date.now() >= sleepDeadline.current) {
                e.currentTarget.pause();
                setSleepMinutes(0);
                setIsPlaying(false);
                notify('睡眠定时已暂停播放。晚安。');
              } else setIsPlaying(true);
            }}
            onPause={(e) => {
              setIsPlaying(false);
              if (playing?.topic === 'podcast') {
                try {
                  localStorage.setItem(
                    'glimmer-progress:' + playing.id,
                    String(e.currentTarget.currentTime),
                  );
                } catch {}
              }
            }}
            onEnded={() => {
              setIsPlaying(false);
              if (sleepMinutes === -1) {
                setSleepMinutes(0);
                notify('本集已经结束。晚安。');
              }

              if (playing?.topic === 'podcast') {
                try {
                  localStorage.removeItem('glimmer-progress:' + playing.id);
                } catch {}
              }
            }}
            onTimeUpdate={(e) => {
              const time = e.currentTarget.currentTime;
              setPosition(time);
              if (playing?.topic === 'podcast' && Date.now() - progressWrite.current > 5000) {
                try {
                  localStorage.setItem('glimmer-progress:' + playing.id, String(time));
                } catch {}
                progressWrite.current = Date.now();
              }
            }}
            onLoadedMetadata={(e) => {
              if (Number.isFinite(e.currentTarget.duration)) {
                setAudioDuration(e.currentTarget.duration);
                if (playing?.topic === 'podcast') {
                  try {
                    const time = resumePosition(
                      localStorage.getItem('glimmer-progress:' + playing.id),
                      e.currentTarget.duration,
                    );
                    if (time > 0 && time < e.currentTarget.duration - 5)
                      e.currentTarget.currentTime = time;
                  } catch {}
                }
              }
            }}
            onError={() => {
              setIsPlaying(false);
              notify('这段声音暂时无法播放。');
            }}
          />
          {playing ? (
            <div className="player-bar">
              <button
                className="play-button"
                onClick={() => play(playing)}
                aria-label={isPlaying ? '暂停当前声音' : '继续播放'}
              >
                <Icon name={isPlaying ? 'pause' : 'play'} fill={!isPlaying} size={18} />
              </button>
              <div className="player-info">
                <strong>
                  <span data-original className="original-text">
                    {playing.title}
                  </span>
                </strong>
                <span>
                  <span data-original className="original-text">
                    {playing.signature}
                  </span>
                </span>
              </div>
              <div className="player-progress">
                <input
                  aria-label="音频播放进度"
                  type="range"
                  disabled={playing.demo && !playing.audioUrl}
                  min={0}
                  max={audioDuration || playing.duration}
                  step={0.1}
                  value={position}
                  onChange={(e) => {
                    if (audioRef.current) {
                      audioRef.current.currentTime = Number(e.target.value);
                      setPosition(Number(e.target.value));
                    }
                  }}
                />
                <span>
                  {durationLabel(position)} / {durationLabel(audioDuration || playing.duration)}
                </span>
              </div>
              {playing.topic === 'podcast' ? (
                <div className="podcast-skip">
                  <button
                    aria-label="后退 15 秒"
                    onClick={() => {
                      const a = audioRef.current;
                      if (a) a.currentTime = Math.max(0, a.currentTime - 15);
                    }}
                  >
                    −15s
                  </button>
                  <button
                    aria-label="前进 15 秒"
                    onClick={() => {
                      const a = audioRef.current;
                      if (a && Number.isFinite(a.duration))
                        a.currentTime = Math.min(a.duration, a.currentTime + 15);
                    }}
                  >
                    +15s
                  </button>
                </div>
              ) : null}
              <button
                disabled={playing.demo && !playing.audioUrl}
                className="rate-button"
                aria-label="切换播放速度"
                onClick={() => {
                  const speeds =
                    playing.topic === 'podcast' ? [0.75, 1, 1.25, 1.5] : [1, 1.25, 1.5];
                  const n = speeds[(speeds.indexOf(rate) + 1) % speeds.length];
                  setRate(n);
                  if (audioRef.current) audioRef.current.playbackRate = n;
                }}
              >
                {rate}×
              </button>
              {sleepMinutes !== 0 ? (
                <button
                  className="text-button sleep-status"
                  onClick={() => setSleepMinutes(0)}
                  aria-label="取消睡眠定时"
                >
                  {sleepMinutes === -1 ? '本集结束后' : `${sleepMinutes} 分钟定时`} · 取消
                </button>
              ) : null}
              <button
                className="icon-button"
                aria-label="关闭播放器"
                onClick={() => {
                  audioRef.current?.pause();
                  window.speechSynthesis?.cancel();
                  speechRef.current = null;
                  setIsPlaying(false);
                  setPlaying(null);
                  setSleepMinutes(0);
                }}
              >
                <Icon name="close" />
              </button>
            </div>
          ) : null}
          {postcard ? <VoicePostcard voice={postcard} onClose={() => setPostcard(null)} /> : null}
          {toast ? (
            <div className="toast" role="status">
              <Icon name="sun" size={18} />
              {toast}
              <button className="icon-button" aria-label="关闭提示" onClick={() => setToast('')}>
                <Icon name="close" size={16} />
              </button>
            </div>
          ) : null}
          {authOpen ? (
            <AuthDialog
              onClose={() => {
                setAuthOpen(false);
                void loadMe();
              }}
              onComplete={completeAuth}
              onRules={() => {
                setAuthOpen(false);
                navigate('about');
              }}
            />
          ) : null}
          {selected ? (
            <div
              className="modal-backdrop"
              onClick={(e) => {
                if (e.target === e.currentTarget) setSelected(null);
              }}
            >
              <section
                className="voice-modal"
                role="dialog"
                aria-modal="true"
                aria-label="声音详情"
                tabIndex={-1}
                ref={modalRef}
              >
                <button
                  className="modal-close icon-button"
                  aria-label="关闭声音详情"
                  onClick={() => setSelected(null)}
                >
                  <Icon name="close" />
                </button>
                <span className="detail-mood">{selected.mood}</span>
                <h2>
                  <span data-original className="original-text">
                    {selected.title}
                  </span>
                </h2>
                <p className="detail-signature">
                  <span data-original className="original-text">
                    {selected.signature}
                  </span>{' '}
                  · 录制于 {dateLabel(selected.recordedAt)}
                </p>
                <div className="detail-player">
                  <button
                    className="play-button"
                    onClick={() => play(selected)}
                    aria-label="播放详情声音"
                  >
                    <Icon
                      name={playing?.id === selected.id && isPlaying ? 'pause' : 'play'}
                      fill={!(playing?.id === selected.id && isPlaying)}
                    />
                  </button>
                  <Wave
                    progress={playing?.id === selected.id ? position / (audioDuration || 1) : 0}
                  />
                  <span>{durationLabel(selected.duration)}</span>
                </div>
                {selected.topic === 'podcast' &&
                podcastChapters(selected.transcript, selected.duration).length ? (
                  <div className="podcast-chapters" aria-label="节目章节">
                    <h3>从这一章开始</h3>
                    {podcastChapters(selected.transcript, selected.duration).map((c) => (
                      <button
                        key={c.seconds}
                        onClick={async () => {
                          if (playing?.id !== selected.id) await play(selected);
                          const a = audioRef.current;
                          if (a && Number.isFinite(a.duration)) {
                            a.currentTime = c.seconds;
                            void a.play().catch(() => notify('请点击播放开始倾听。'));
                          }
                        }}
                      >
                        {durationLabel(c.seconds)} ·{' '}
                        <span data-original className="original-text">
                          {c.title}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="transcript">
                  <h3>安静地读一读</h3>
                  <p>
                    <span data-original={!!selected.transcript}>
                      {selected.transcript || '这段声音暂未提供文字稿，你可以播放原录音。'}
                    </span>
                  </p>
                </div>
                {selected.source ? (
                  <p className="small-note">
                    出处：
                    <span data-original className="original-text">
                      {selected.source}
                    </span>
                  </p>
                ) : null}
                <div className="detail-dates">
                  <span>录制日期：{dateLabel(selected.recordedAt)}（录制者填写）</span>
                  <span>
                    保存时间：
                    {new Date(selected.createdAt).toLocaleString(
                      locale === 'en' ? 'en-GB' : 'zh-CN',
                      {
                        timeZone: 'Asia/Shanghai',
                      },
                    )}{' '}
                    · 上海时间
                  </span>
                  {selected.futureYear ? <span>写给 {selected.futureYear} 年的自己</span> : null}
                </div>
                {!selected.demo && own.some((v) => v.id === selected.id) ? (
                  <CalendarReminder key={selected.id} voice={selected} />
                ) : null}
                {!selected.demo &&
                selected.parentId &&
                own.some((v) => v.id === selected.parentId) ? (
                  <button
                    className="text-button"
                    onClick={() => setSelected(own.find((v) => v.id === selected.parentId) ?? null)}
                  >
                    听听当年的那段声音 <Icon name="arrow" size={16} />
                  </button>
                ) : null}
                {own
                  .filter((v) => v.parentId === selected.id)
                  .map((v) => (
                    <button
                      className="text-button reply-link"
                      key={v.id}
                      onClick={() => setSelected(v)}
                    >
                      后来留下的回应 · {dateLabel(v.recordedAt)} <Icon name="arrow" size={16} />
                    </button>
                  ))}
                {canMakePostcard(selected) ? (
                  <button
                    className="button outline small"
                    onClick={() => {
                      setPostcard(selected);
                      setSelected(null);
                    }}
                  >
                    制作声音明信片
                  </button>
                ) : null}
                <div className="detail-actions">
                  {selected.visibility === 'public' && selected.status === 'approved' ? (
                    <>
                      <button
                        className="button outline small"
                        onClick={() => react(selected, 'heart')}
                      >
                        <Icon name="heart" size={17} />
                        给了我力量
                      </button>
                      <button
                        className="button outline small"
                        onClick={() => react(selected, 'save')}
                      >
                        <Icon name="save" size={17} />
                        收藏
                      </button>
                    </>
                  ) : null}
                  {selected.status === 'approved' ? (
                    <button className="text-button" onClick={() => share(selected)}>
                      分享
                    </button>
                  ) : null}
                  <button className="text-button danger" onClick={() => report(selected)}>
                    举报
                  </button>
                </div>
                {selected.demo ? (
                  <p className="small-note">此内容为展示素材，请参考原始来源与使用说明。</p>
                ) : null}
              </section>
            </div>
          ) : null}
        </>
      }
    </LocalizedView>
  );
}
