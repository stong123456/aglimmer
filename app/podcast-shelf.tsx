'use client';
import { useEffect, useState } from 'react';
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
  onPlay: (v: Voice) => void;
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
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch('/api/voices?topic=podcast&mode=all', { signal: controller.signal })
      .then(async (r) => {
        const d = (await r.json()) as { error?: string; voices: Voice[] };
        if (!r.ok) throw Error(d.error || '暂时无法打开播客');
        setEpisodes(d.voices);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);
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
      `${v.title}${v.signature}${v.transcript}`.includes(query.trim()) &&
      (length === 'all' || (length === 'short' ? v.duration < 600 : v.duration >= 600)),
  );
  return (
    <section className="page-section podcast-page">
      <div className="podcast-cover">
        <span className="handwritten">A Glimmer · 慢慢听</span>
        <h1>让故事，陪你慢下来。</h1>
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
            placeholder="故事名、作者或内容"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          睡眠定时
          <select value={timer} onChange={(e) => onTimer(Number(e.target.value))}>
            <option value={0}>关闭</option>
            <option value={-1}>本集结束后</option>
            <option value={15}>15 分钟后暂停</option>
            <option value={30}>30 分钟后暂停</option>
            <option value={45}>45 分钟后暂停</option>
            <option value={60}>60 分钟后暂停</option>
          </select>
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
        定时对当前播放器生效；切换页面仍有效，关闭网页后结束。播放进度仅保存在此浏览器。
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
              <h2>{v.title}</h2>
              <p>{v.transcript || '戴上耳机，听听这个故事。'}</p>
              <small>
                {v.signature} · {dateLabel(v.recordedAt)}
              </small>
              <button className="button outline" onClick={() => onPlay(v)}>
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
          <h2>{episodes.length ? '这个条件下还没有故事' : '第一本有声音的故事书，等你来写。'}</h2>
          <p>这里会收录经过审核的长内容。可以分享原创故事，或你有朗读授权的作品。</p>
          {episodes.length ? (
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
            上传第一期播客
          </button>
        </div>
      )}
      <div className="guideline">
        <p>
          适合安静倾听：原创睡前故事、自然观察、温柔的生活随笔。请注明作品来源与朗读授权，避免突然的高音量、惊吓或刺激性内容。睡眠定时依赖浏览器运行，后台冻结时可能延迟。
        </p>
      </div>
    </section>
  );
}
