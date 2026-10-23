'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Copy, Play, X } from 'lucide-react';
import { usePreferences } from './preferences';
import { CLASSIC_QUOTES, QUOTE_THEMES, classicEmbedUrl, type ClassicQuote } from '@/lib/quotes';
import type { Voice } from '@/lib/shared';
export default function QuoteLibrary({
  compact = false,
  onExplore,
  onStart,
  collection = 'all',
}: {
  compact?: boolean;
  onExplore?: () => void;
  onStart: (quote: ClassicQuote) => void;
  onPlay?: (voice: Voice) => void;
  playingId?: string;
  isPlaying?: boolean;
  collection?: 'all' | 'long';
}) {
  const { locale } = usePreferences();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [theme, setTheme] = useState('all'),
    [query, setQuery] = useState(''),
    [language, setLanguage] = useState('all'),
    [kind, setKind] = useState('all');
  const [limit, setLimit] = useState(12),
    [active, setActive] = useState(''),
    [notice, setNotice] = useState('');
  const [hidden, setHidden] = useState<string[] | null>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  const [reportId, setReportId] = useState(''),
    [reason, setReason] = useState(''),
    [reportBusy, setReportBusy] = useState(false);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    setHidden(null);
    void fetch('/api/classics', { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw Error();
        const d = (await r.json()) as { hidden: string[] };
        if (!Array.isArray(d.hidden)) throw Error();
        setHidden(d.hidden);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(true);
      });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const close = () => setActive('');
    window.addEventListener('glimmer:audio-play', close);
    return () => window.removeEventListener('glimmer:audio-play', close);
  }, []);
  useEffect(() => {
    setActive('');
    setLimit(12);
  }, [theme, query, language, kind]);
  const candidates = CLASSIC_QUOTES.filter(
    (q) => !hidden?.includes(q.id) && (collection !== 'long' || q.kind === 'speech'),
  );
  const filtered = compact
    ? candidates.filter((q) => ['clouds', 'sail', 'jobs'].includes(q.id))
    : candidates.filter(
        (q) =>
          (theme === 'all' || q.theme === theme) &&
          (language === 'all' || q.originalLanguage === language) &&
          (kind === 'all' || q.kind === kind) &&
          `${q.zh} ${q.en} ${q.author} ${q.authorEn} ${q.work} ${q.workEn}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
      );
  const shown = filtered.slice(0, compact ? 3 : limit);
  useEffect(() => {
    if (compact || hidden === null) return;
    const id = new URLSearchParams(location.search).get('quote');
    const index = filtered.findIndex((q) => q.id === id);
    if (index < 0) return;
    if (index >= limit) {
      setLimit(Math.ceil((index + 1) / 12) * 12);
      return;
    }
    const card = root.current?.querySelector<HTMLElement>(`[data-quote="${id}"]`);
    card?.scrollIntoView({ block: 'center' });
    card?.focus({ preventScroll: true });
    // Deep links are restored once source visibility has loaded, not after each filter edit.
  }, [hidden, compact, limit]);
  function open(q: ClassicQuote) {
    if (active === q.id) {
      setActive('');
      return;
    }
    document.querySelectorAll('audio').forEach((a) => a.pause());
    window.speechSynthesis?.cancel();
    window.dispatchEvent(new Event('glimmer:external-play'));
    setActive(q.id);
  }
  async function copy(q: ClassicQuote) {
    const url = new URL('https://aglimmer.xyz/');
    url.searchParams.set('view', 'quotes');
    url.searchParams.set('quote', q.id);
    try {
      await navigator.clipboard.writeText(
        `${q.author} / ${q.authorEn} · ${q.work} / ${q.workEn}\n${q.sourceUrl}\n${url}`,
      );
      setNotice(L('素材出处与链接已复制。', 'Source attribution and links copied.'));
    } catch {
      setNotice(
        L('暂时无法复制，请使用来源链接。', 'Copy is unavailable. Please use the source link.'),
      );
    }
  }
  async function submitReport(e: React.FormEvent) {
    e.preventDefault();
    if (reportBusy) return;
    setReportBusy(true);
    setNotice('');
    try {
      const r = await fetch('/api/classics/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reportId, reason }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error || L('暂时无法提交，请稍后重试。', 'Please try again later.'));
      setNotice(
        L(
          '反馈已进入审核队列，谢谢你帮助我们核对。',
          'Your source or rights report is in the review queue. Thank you.',
        ),
      );
      setReportId('');
      setReason('');
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setReportBusy(false);
    }
  }
  return (
    <section
      className={compact ? 'classic-library compact' : 'page-section classic-library'}
      ref={root}
      aria-label={L('双语声音灵感馆', 'The listening library')}
    >
      <div className="section-heading">
        <div>
          <span className="handwritten">
            {L('从一段好声音，开始你的表达', 'Listen closely. Find your own words.')}
          </span>
          {compact ? (
            <h2>{L('双语声音灵感馆', 'The listening library')}</h2>
          ) : (
            <h1>
              {L(
                collection === 'long' ? '留一点时间，听一场演讲' : '双语声音灵感馆',
                collection === 'long' ? 'Time for a longer listen' : 'The listening library',
              )}
            </h1>
          )}
          <p>
            {L(
              '诗词里的片刻安静，演讲里的向前一步。',
              'Quiet moments in poetry. New perspectives in memorable talks.',
            )}
          </p>
        </div>
        {compact ? (
          <button className="text-button" onClick={onExplore}>
            {L('探索声音灵感馆', 'Explore the library')} <ArrowRight size={17} aria-hidden />
          </button>
        ) : (
          <BookOpen size={30} aria-hidden />
        )}
      </div>
      <p className="small-note">
        {L(
          '网络经典精选 · 中英文导读 · 原始出处 · 来源播放器',
          'Curated online classics · Bilingual introductions · Original sources · Source players',
        )}
      </p>
      {!compact ? (
        <>
          <div className="chips" role="group" aria-label={L('按主题筛选', 'Filter by theme')}>
            <button
              aria-pressed={theme === 'all'}
              className={theme === 'all' ? 'selected' : ''}
              onClick={() => setTheme('all')}
            >
              {L('全部主题', 'All themes')}
            </button>
            {QUOTE_THEMES.map((t) => (
              <button
                key={t.id}
                aria-pressed={theme === t.id}
                className={theme === t.id ? 'selected' : ''}
                onClick={() => setTheme(t.id)}
              >
                {L(t.label, t.labelEn)}
              </button>
            ))}
          </div>
          <div className="classic-search">
            <label>
              {L('找一段共鸣', 'Find something that resonates')}
              <input
                type="search"
                maxLength={100}
                placeholder={L(
                  '作品、作者或关键词，中英文都可以',
                  'Search works, authors or keywords',
                )}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label>
              {L('原声语言', 'Spoken language')}
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="all">{L('全部语言', 'All languages')}</option>
                <option value="zh">{L('中文', 'Chinese')}</option>
                <option value="en">{L('英文', 'English')}</option>
              </select>
            </label>
            <label>
              {L('内容类型', 'Content type')}
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="all">{L('全部内容', 'All types')}</option>
                <option value="poetry">{L('诗词朗读', 'Poetry readings')}</option>
                <option value="speech">{L('成长演讲', 'Inspiring talks')}</option>
                <option value="film">{L('经典台词', 'Film monologues')}</option>
              </select>
            </label>
          </div>
        </>
      ) : null}
      {error ? (
        <div role="alert">
          <p>
            {L('暂时无法核对素材状态，请稍后重试。', 'Source availability could not be checked.')}
          </p>
          <button className="button outline small" onClick={() => setRetry((n) => n + 1)}>
            {L('重新加载', 'Try again')}
          </button>
        </div>
      ) : hidden === null ? (
        <p role="status">{L('正在打开声音灵感馆…', 'Opening the listening library…')}</p>
      ) : (
        <>
          {!compact ? (
            <p className="small-note" role="status">
              {L(
                `找到 ${filtered.length} 部作品 · 已展示 ${shown.length} 部`,
                `Found ${filtered.length} works · Showing ${shown.length}`,
              )}
            </p>
          ) : null}
          <div className="classic-grid">
            {shown.map((q) => (
              <article
                className={active === q.id ? 'classic-card is-current' : 'classic-card'}
                key={q.id}
                data-quote={q.id}
                tabIndex={-1}
              >
                <span className="topic-label">
                  {L(
                    QUOTE_THEMES.find((t) => t.id === q.theme)!.label,
                    QUOTE_THEMES.find((t) => t.id === q.theme)!.labelEn,
                  )}
                </span>
                <h3>{L(q.work, q.workEn)}</h3>
                <p className="classic-author">{L(q.author, q.authorEn)}</p>
                <blockquote>
                  <p lang="zh-CN" data-original>
                    {q.zh}
                  </p>
                  <p lang="en" data-original>
                    {q.en}
                  </p>
                </blockquote>
                <p className="small-note">
                  {q.kind === 'poetry'
                    ? L(
                        '原作摘句 / 本站意译或导读 · 录音为原作语言',
                        'Original excerpt / Our translation or introduction · Original-language recording',
                      )
                    : L(
                        '中英文为本站导读，字幕以来源平台为准',
                        'Our bilingual introduction; subtitles depend on the source',
                      )}
                </p>
                <div className="classic-actions">
                  <button
                    className="button outline small"
                    onClick={() => open(q)}
                    aria-expanded={active === q.id}
                  >
                    <span aria-hidden>
                      {active === q.id ? <X size={16} /> : <Play size={16} />}
                    </span>
                    {active === q.id
                      ? L('关闭播放器', 'Close player')
                      : L('打开原声播放器', 'Open source player')}
                  </button>
                  <a className="text-button" href={q.sourceUrl} target="_blank" rel="noreferrer">
                    {L('在原站收听 ↗', 'Listen at source ↗')}
                  </a>
                </div>
                {active === q.id ? (
                  <div className="classic-player">
                    <p className="small-note">
                      {L(
                        '此播放器连接第三方来源；如无法播放，请打开原站。睡眠定时仅对本站录音播放器生效。',
                        'This player connects to the source service. Use its original page if playback fails. The sleep timer applies only to A Glimmer recordings.',
                      )}
                    </p>
                    <iframe
                      title={`${q.workEn} — ${q.media.creditEn}`}
                      src={classicEmbedUrl(q)}
                      allow="fullscreen; encrypted-media; picture-in-picture"
                      allowFullScreen
                      referrerPolicy="strict-origin-when-cross-origin"
                      className={q.media.provider === 'youtube' ? 'video' : 'audio'}
                    />
                    <button className="text-button" onClick={() => setActive('')}>
                      {L('关闭并停止来源播放', 'Close and stop source playback')}
                    </button>
                  </div>
                ) : null}
                {!compact ? (
                  <>
                    <p>{locale === 'en' ? `Reflection: ${q.en}` : q.context}</p>
                    <button className="text-button" onClick={() => onStart(q)}>
                      {L('记录我听后的感受', 'Record my reflection')}{' '}
                      <ArrowRight size={15} aria-hidden />
                    </button>
                    <button className="text-button" onClick={() => void copy(q)}>
                      <Copy size={14} aria-hidden />
                      {L('复制出处与链接', 'Copy attribution and links')}
                    </button>
                    <details className="classic-rights">
                      <summary>{L('出处与使用说明', 'Source and usage details')}</summary>
                      <p>{q.media.creditEn}</p>
                      <a href={q.sourceUrl} target="_blank" rel="noreferrer">
                        {L('查看原始发布页 ↗', 'Original source ↗')}
                      </a>
                      <p>{L(q.rights.basis, q.rights.basisEn)}</p>
                      <a href={q.rights.licenseUrl} target="_blank" rel="noreferrer">
                        {L('来源许可或条款 ↗', 'Source license or terms ↗')}
                      </a>
                      <p>
                        {L(
                          '本站导读与意译不代表官方字幕。请勿把现成音频、现代译本或配乐直接作为自己的投稿。',
                          'Our introductions and translations are not official subtitles. Do not submit existing recordings, modern translations or music as your own work.',
                        )}
                      </p>
                      <small>
                        {L('来源核对日期：', 'Source checked: ')}
                        {q.rights.checkedAt}
                      </small>
                      <button
                        className="text-button"
                        onClick={() => {
                          setReportId(q.id);
                          setReason('');
                        }}
                      >
                        {L('反馈版权、出处或播放问题', 'Report rights, source or playback issues')}
                      </button>
                    </details>
                    {reportId === q.id ? (
                      <form className="classic-report" onSubmit={(e) => void submitReport(e)}>
                        <label>
                          {L(
                            '请提供来源或问题线索（10–300 字）',
                            'Please describe the issue or source (10–300 characters)',
                          )}
                          <textarea
                            required
                            minLength={10}
                            maxLength={300}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                          />
                        </label>
                        <p className="small-note">
                          {L(
                            '无需登录。仅审核员可见，请勿填写敏感个人信息。',
                            'No sign-in needed. Visible only to reviewers; please omit sensitive information.',
                          )}
                        </p>
                        <button
                          className="button outline small"
                          disabled={reportBusy || reason.trim().length < 10}
                          type="submit"
                        >
                          {reportBusy
                            ? L('正在提交…', 'Submitting…')
                            : L('提交反馈', 'Submit report')}
                        </button>
                        <button
                          className="text-button"
                          type="button"
                          disabled={reportBusy}
                          onClick={() => setReportId('')}
                        >
                          {L('取消', 'Cancel')}
                        </button>
                      </form>
                    ) : null}
                  </>
                ) : null}
              </article>
            ))}
          </div>
          {!shown.length ? (
            <div className="empty">
              <h3>{L('暂时没有匹配的作品', 'No matching works')}</h3>
              <button
                className="text-button"
                onClick={() => {
                  setTheme('all');
                  setQuery('');
                  setLanguage('all');
                  setKind('all');
                }}
              >
                {L('清除筛选', 'Clear filters')}
              </button>
            </div>
          ) : !compact && shown.length < filtered.length ? (
            <button className="button outline" onClick={() => setLimit((n) => n + 12)}>
              {L('再发现一些好声音', 'Discover more works')}
            </button>
          ) : null}
        </>
      )}
      {notice ? (
        <div className="classic-notice toast" role="status">
          {notice}
          <button
            className="text-button"
            aria-label={L('关闭提示', 'Dismiss notification')}
            onClick={() => setNotice('')}
          >
            ×
          </button>
        </div>
      ) : null}
      {!compact ? (
        <p className="small-note">
          {L(
            '人工整理的经典选集，不代表实时热度排名。外部平台的访问、字幕与嵌入权限可能变化；未获许可的短视频混剪不收录。',
            'An editorial collection, not a live popularity ranking. Source access, captions and embedding permissions may change. Unlicensed compilations are excluded.',
          )}
        </p>
      ) : null}
    </section>
  );
}
