'use client';
import { LocalizedView } from './preferences';
import { useEffect, useRef, useState } from 'react';
import { resumePosition } from '@/lib/podcast';
import { type Voice, durationLabel, dateLabel } from '@/lib/shared';
export default function PodcastShelf({
  onPlay,
  onCreate,
  onDetails,
  playingId,
  timer,
  onTimer,
}: {
  onPlay: (v: Voice, queue?: Voice[]) => void;
  onCreate: () => void;
  onDetails: (v: Voice) => void;
  playingId?: string;
  timer: number;
  onTimer: (minutes: number) => void;
}) {
  const [episodes, setEpisodes] = useState<Voice[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [retry, setRetry] = useState(0);
  const [length, setLength] = useState('all');
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [cursor, setCursor] = useState<string | null>(null),
    [moreLoading, setMoreLoading] = useState(false),
    [moreError, setMoreError] = useState('');
  const requestId = useRef(0);
  useEffect(() => {
    const id = ++requestId.current;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setCursor(null);
    setMoreLoading(false);
    setMoreError('');
    const params = new URLSearchParams({ topic: 'podcast', mode: 'all', length });
    if (query.trim()) params.set('q', query.trim());
    const timer = setTimeout(
      () => {
        void fetch('/api/voices?' + params, { signal: controller.signal })
          .then(async (r) => {
            const d = (await r.json()) as {
              error?: string;
              voices: Voice[];
              nextCursor: string | null;
            };
            if (!r.ok) throw Error(d.error || '暂时无法打开播客');
            if (id === requestId.current && !controller.signal.aborted) {
              setEpisodes(d.voices);
              setCursor(d.nextCursor);
            }
          })
          .catch((e) => {
            if (e.name !== 'AbortError') setError(e.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      query.trim() ? 250 : 0,
    );
    return () => {
      controller.abort();
      clearTimeout(timer);
      requestId.current++;
    };
  }, [retry, query, length]);
  async function more() {
    if (!cursor || loading || moreLoading) return;
    const id = requestId.current;
    setMoreLoading(true);
    setMoreError('');
    try {
      const params = new URLSearchParams({ topic: 'podcast', mode: 'all', length, before: cursor });
      if (query.trim()) params.set('q', query.trim());
      const r = await fetch('/api/voices?' + params),
        d = (await r.json()) as { voices: Voice[]; nextCursor: string | null; error?: string };
      if (!r.ok) throw Error(d.error || '暂时无法打开播客');
      if (id !== requestId.current) return;
      setEpisodes((current) => [
        ...new Map([...current, ...d.voices].map((v) => [v.id, v])).values(),
      ]);
      setCursor(d.nextCursor);
    } catch (e) {
      if (id === requestId.current) setMoreError((e as Error).message);
    } finally {
      if (id === requestId.current) setMoreLoading(false);
    }
  }
  useEffect(() => {
    const update = () => {
      const values: Record<string, number> = {};
      for (const v of episodes) {
        try {
          values[v.id] = resumePosition(
            localStorage.getItem('glimmer-progress:' + v.id),
            v.duration,
          );
        } catch {}
      }
      setProgress(values);
    };
    update();
    const interval = setInterval(update, 10000);
    return () => clearInterval(interval);
  }, [episodes]);
  const shown = episodes.filter(
    (v) =>
      `${v.title}${v.signature}${v.transcript}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()) &&
      (length === 'all' || (length === 'short' ? v.duration < 600 : v.duration >= 600)),
  );
  return (
    <LocalizedView>
      {
        <section className="page-section podcast-page">
          <div className="podcast-cover">
            <span className="handwritten">A Glimmer · 慢慢听</span>
            <h2>社区长声音</h2>
            <p>
              一段长一点的声音，一段不用赶路的时间。
              <br />
              睡前小故事、生活随笔、安静的陪伴，都在这里。
            </p>
            <button className="button primary" onClick={onCreate}>
              分享一段长声音
            </button>
            <small>1–30 分钟 · 最大 30 MB · 审核后公开</small>
          </div>
          <div className="podcast-tools">
            <label>
              找一个故事
              <input
                type="search"
                maxLength={100}
                placeholder="故事名、作者或内容"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label>
              想听多久？
              <select value={length} onChange={(e) => setLength(e.target.value)}>
                <option value="all">不限时长</option>
                <option value="short">十分钟以内</option>
                <option value="long">十到三十分钟</option>
              </select>
            </label>
          </div>
          <p className="small-note">
            点击播放后可打开睡眠模式，设置连续收听、倒计时或播完指定作品停止。进度仅保存在此浏览器。
          </p>
          {loading ? (
            <p role="status">正在打开故事书架…</p>
          ) : error ? (
            <div role="alert">
              <p>{error}</p>
              <button className="button outline" onClick={() => setRetry((n) => n + 1)}>
                重新打开书架
              </button>
            </div>
          ) : shown.length ? (
            <div className="podcast-grid">
              {shown.map((v) => (
                <article className="podcast-episode" key={v.id}>
                  <span className="episode-label">长声音 · {durationLabel(v.duration)}</span>
                  <h2>
                    <span data-original className="original-text">
                      {v.title}
                    </span>
                  </h2>
                  <p>
                    <span data-original={!!v.transcript}>
                      {v.transcript || '戴上耳机，听听这个故事。'}
                    </span>
                  </p>
                  <small>
                    <span data-original className="original-text">
                      {v.signature}
                    </span>{' '}
                    · {dateLabel(v.recordedAt)}
                  </small>
                  <button className="button outline" onClick={() => onPlay(v, shown)}>
                    {playingId === v.id
                      ? '播放 / 暂停'
                      : progress[v.id]
                        ? `继续收听 · ${durationLabel(progress[v.id])}`
                        : '开始倾听'}
                  </button>
                  <button className="text-button episode-details" onClick={() => onDetails(v)}>
                    文字稿、章节与收藏 →
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty">
              <h2>
                {episodes.length || query.trim() || length !== 'all'
                  ? '这个条件下还没有故事'
                  : '第一本有声音的故事书，等你来写。'}
              </h2>
              <p>这里会收录经过审核的长内容。可以分享原创故事，或你有朗读授权的作品。</p>
              {episodes.length || query.trim() || length !== 'all' ? (
                <button
                  className="text-button"
                  onClick={() => {
                    setQuery('');
                    setLength('all');
                  }}
                >
                  清除筛选
                </button>
              ) : null}
              <button className="button outline" onClick={onCreate}>
                分享一段长声音
              </button>
            </div>
          )}
          {!loading && !error && cursor ? (
            <div className="load-more">
              <button className="button outline" disabled={moreLoading} onClick={() => void more()}>
                {moreLoading ? '正在寻找更多故事…' : '再找一些故事'}
              </button>
            </div>
          ) : null}
          {moreError ? <p role="alert">{moreError}</p> : null}
          <div className="guideline">
            <p>
              适合安静倾听：原创睡前故事、自然观察、温柔的生活随笔。请注明作品来源与朗读授权，避免突然的高音量、惊吓或刺激性内容。睡眠定时依赖浏览器运行，后台冻结时可能延迟。
            </p>
          </div>
        </section>
      }
    </LocalizedView>
  );
}
