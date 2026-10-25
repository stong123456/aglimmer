'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Copy, Play, Pause, Moon } from 'lucide-react';
import { usePreferences } from './preferences';
import type { ClassicQuote } from '@/lib/quotes';
import { QUOTE_THEMES } from '@/lib/quote-themes';
import { classicListeningItem } from '@/lib/listening';
import { quietChinese } from '@/lib/curation';
import {
  LIBRARY_SHELVES,
  matchesShelf,
  catalogPage,
  librarySummary,
  discoveryOrder,
} from '@/lib/library-discovery';
import OfficialListening from './official-listening';
import { useListening } from './listening-player';
import { useClassicSources } from './classic-sources';
import { quietClassics } from './featured-listening';
import { durationLabel, type Voice } from '@/lib/shared';
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
  const listening = useListening();
  const { hidden, health, error, reload, catalog, officialSources } = useClassicSources();
  const L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const [mode, setMode] = useState('recordings'),
    [shelf, setShelf] = useState('all'),
    [medium, setMedium] = useState('all'),
    [length, setLength] = useState('all'),
    [linkedId, setLinkedId] = useState('');
  const linkedFocused = useRef('');
  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(location.search);
      setMode(params.get('sources') === 'official' ? 'official' : 'recordings');
      setShelf(params.get('shelf') ?? 'all');
      setLinkedId(params.get('quote') ?? '');
      linkedFocused.current = '';
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  const [quietOnly, setQuietOnly] = useState(false);
  const [theme, setTheme] = useState('all'),
    [query, setQuery] = useState(''),
    [language, setLanguage] = useState('all'),
    [kind, setKind] = useState('all'),
    [series, setSeries] = useState('all');
  const [limit, setLimit] = useState(12),
    [notice, setNotice] = useState('');
  const [reportId, setReportId] = useState(''),
    [reason, setReason] = useState(''),
    [reportBusy, setReportBusy] = useState(false);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    setLimit(12);
  }, [theme, query, language, kind, series, quietOnly, shelf, medium, length]);
  const candidates = (
    quietOnly
      ? quietChinese(catalog ?? [])
      : shelf === 'all' && series === 'all' && !query
        ? discoveryOrder(catalog ?? [])
        : (catalog ?? [])
  ).filter(
    (q) =>
      !hidden?.includes(q.id) &&
      (quietOnly || collection !== 'long' || q.kind === 'speech' || q.kind === 'story'),
  );
  const books = [
    ...new Map(candidates.filter((q) => q.series).map((q) => [q.series!, q])).values(),
  ];
  const filtered = compact
    ? candidates.filter((q) =>
        ['lv-zh-prose-gesheng', 'lv-zh-prose-congcong', 'jobs'].includes(q.id),
      )
    : candidates.filter(
        (q) =>
          matchesShelf(q, shelf) &&
          (medium === 'all' || q.media.provider === medium) &&
          (length === 'all' ||
            (length === 'short'
              ? (q.media.duration ?? Infinity) < 600
              : (q.media.duration ?? 0) >= 600)) &&
          (theme === 'all' || q.theme === theme) &&
          (language === 'all' || q.originalLanguage === language) &&
          (kind === 'all' || q.kind === kind) &&
          (series === 'all' || q.series === series) &&
          `${q.zh} ${q.en} ${q.author} ${q.authorEn} ${q.work} ${q.workEn} ${q.series ?? ''} ${q.seriesEn ?? ''} ${q.media.credit} ${q.media.creditEn}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
      );
  const shown = compact ? filtered.slice(0, 3) : catalogPage(filtered, limit, linkedId);
  const summary = librarySummary(candidates);
  useEffect(() => {
    if (compact || hidden === null) return;
    if (!linkedId || linkedFocused.current === linkedId) return;
    const card = root.current?.querySelector<HTMLElement>(`[data-quote="${CSS.escape(linkedId)}"]`);
    if (card) {
      card.scrollIntoView({ block: 'center' });
      card.focus({ preventScroll: true });
      linkedFocused.current = linkedId;
    }
  }, [hidden, compact, linkedId, catalog]);
  useEffect(() => {
    if (mode === 'official' && reportId)
      root.current
        ?.querySelector<HTMLElement>('[data-official-report]')
        ?.scrollIntoView({ block: 'center' });
  }, [mode, reportId]);
  function open(q: ClassicQuote) {
    if (listening.current?.catalogId === q.id) {
      listening.toggle();
      return;
    }
    listening.start(filtered.map(classicListeningItem), 'classic:' + q.id);
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
                collection === 'long' ? '慢慢听 · 经典原声书架' : '双语声音灵感馆',
                collection === 'long'
                  ? 'Slow listening · Classic recordings'
                  : 'The listening library',
              )}
            </h1>
          )}
          <p>
            {L(
              '故事、散文、自然与普通人的日常，留给你慢慢听。',
              'Stories, essays, nature and everyday lives, for unhurried listening.',
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
          '网络经典精选 · 中英文导读 · 原始出处 · 连续播放',
          'Curated classics · Bilingual introductions · Original sources · Continuous listening',
        )}
      </p>
      {!compact ? (
        <>
          <div className="library-summary">
            <strong>{summary.items}</strong> {L('段原声与章节', 'recordings / chapters')}
            <span>
              {' '}
              · {summary.books} {L('本书与录音合集', 'books & audio collections')} · {summary.hours}{' '}
              {L('小时', 'hours')} · {officialSources.filter((s) => !hidden?.includes(s.id)).length}{' '}
              {L('个官方节目入口', 'official programme links')}
            </span>
          </div>
          <div
            className="chips library-mode"
            role="group"
            aria-label={L('选择内容来源', 'Choose source type')}
          >
            <button
              className={mode === 'recordings' ? 'selected' : ''}
              aria-pressed={mode === 'recordings'}
              onClick={() => setMode('recordings')}
            >
              {L('站内原声书架', 'Playable recordings')}
            </button>
            <button
              className={mode === 'official' ? 'selected' : ''}
              aria-pressed={mode === 'official'}
              onClick={() => setMode('official')}
            >
              {L('官方中文好节目 ↗', 'Official Chinese programmes ↗')}
            </button>
          </div>
          {mode === 'official' && hidden !== null ? (
            <OfficialListening
              onReport={(id) => {
                setReportId(id);
                setReason('');
              }}
            />
          ) : null}
          {mode === 'official' && reportId ? (
            <form
              data-official-report
              className="classic-report"
              onSubmit={(e) => void submitReport(e)}
            >
              <label>
                {L(
                  '描述来源或链接问题（10–300 字）',
                  'Describe a source or link issue (10–300 characters)',
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
                  '仅审核员可见，请勿填写敏感个人信息。',
                  'Visible only to reviewers. Please omit sensitive information.',
                )}
              </p>
              <button
                className="button outline small"
                disabled={reportBusy || reason.trim().length < 10}
              >
                {L('提交反馈', 'Submit report')}
              </button>
              <button type="button" className="text-button" onClick={() => setReportId('')}>
                {L('取消', 'Cancel')}
              </button>
            </form>
          ) : null}
        </>
      ) : null}
      {mode === 'official' && (hidden === null || error) ? (
        <p role="status">
          {L('节目目录暂时未打开。', 'Programme directory is not ready.')}{' '}
          <button className="text-button" onClick={reload}>
            {L('重新加载', 'Reload')}
          </button>
        </p>
      ) : null}
      {mode === 'recordings' ? (
        <>
          {!compact ? (
            <>
              <div
                className="chips shelf-picker"
                role="group"
                aria-label={L('发现一个书架', 'Discover a shelf')}
              >
                {LIBRARY_SHELVES.map((t) => (
                  <button
                    key={t.id}
                    className={shelf === t.id ? 'selected' : ''}
                    aria-pressed={shelf === t.id}
                    onClick={() => {
                      setShelf(t.id);
                      setQuietOnly(false);
                      setQuery('');
                      setLanguage('all');
                      setKind('all');
                      setSeries('all');
                      setTheme('all');
                      setMedium('all');
                      setLength('all');
                      setLinkedId('');
                    }}
                  >
                    {L(t.zh, t.en)}{' '}
                    <small>{candidates.filter((q) => matchesShelf(q, t.id)).length}</small>
                  </button>
                ))}
              </div>
              {shelf === 'bedtime' ? (
                <p className="small-note">
                  {L(
                    '睡前选目依据原文情节初筛，尚未逐段完整听审；每个人的听感不同，可随时调整或反馈。',
                    'Bedtime candidates were screened by their texts; complete audio listening review is pending. Please adjust or report anything that does not suit you.',
                  )}
                </p>
              ) : null}
              {shelf === 'all' || shelf === 'chinese' ? (
                <div className="curation-callout">
                  <div>
                    <strong>
                      {L(
                        '中文故事与散文 · 原声选读',
                        'Chinese stories and essays · Original readings',
                      )}
                    </strong>
                    <p>
                      {L(
                        '让故事和日常风景陪你歇一会儿。每段保留朗读者、时长与原始出处。',
                        'Take a break with stories and everyday scenes. Reader credits, durations and original sources accompany each recording.',
                      )}
                    </p>
                    <p>
                      {L(
                        '中文长听 · 成人经典，非默认睡前故事',
                        'Longer Chinese recordings · Adult classics, outside the default bedtime selection',
                      )}
                    </p>
                    <div className="chips">
                      {[
                        ['社戏', 'Village Opera · 22 min'],
                        ['老残游记', 'Lao Can · Chapter 2 · 20 min'],
                      ].map(([name, en]) => (
                        <button
                          key={name}
                          onClick={() => {
                            setQuietOnly(false);
                            setShelf('all');
                            setMedium('all');
                            setLength('all');
                            setQuery(name);
                            setTheme('all');
                            setKind('all');
                            setSeries('all');
                            setLanguage('zh');
                          }}
                        >
                          {L(name + ' · ' + (name === '社戏' ? '22' : '20') + '分钟', en)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    className="button outline small"
                    aria-pressed={quietOnly}
                    onClick={() => {
                      setQuietOnly(!quietOnly);
                      setShelf('all');
                      setMedium('all');
                      setLength('all');
                      setTheme('all');
                      setQuery('');
                      setKind('all');
                      setSeries('all');
                      setLanguage('all');
                    }}
                  >
                    {quietOnly
                      ? L('返回全部素材', 'Back to all recordings')
                      : L('打开中文故事与散文', 'Open Chinese stories and essays')}
                  </button>
                </div>
              ) : null}
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
                      '作品、作者、朗读者或关键词',
                      'Search works, authors, readers or keywords',
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
                    <option value="story">
                      {L('故事、散文与有声书', 'Stories, essays and audiobooks')}
                    </option>
                    <option value="speech">{L('成长演讲', 'Inspiring talks')}</option>
                    <option value="film">{L('经典台词', 'Film monologues')}</option>
                  </select>
                </label>
              </div>
              <div className="classic-search extra-filters">
                <label>
                  {L('播放形式', 'Format')}
                  <select value={medium} onChange={(e) => setMedium(e.target.value)}>
                    <option value="all">{L('音频与官方视频', 'Audio & official video')}</option>
                    <option value="archive">{L('纯音频', 'Audio')}</option>
                    <option value="youtube">{L('官方视频', 'Official video')}</option>
                  </select>
                </label>
                <label>
                  {L('留多少时间给自己', 'Time to listen')}
                  <select value={length} onChange={(e) => setLength(e.target.value)}>
                    <option value="all">{L('不限时长', 'Any length')}</option>
                    <option value="short">{L('10 分钟以内', 'Under 10 minutes')}</option>
                    <option value="long">{L('10 分钟以上', '10 minutes or longer')}</option>
                  </select>
                </label>
              </div>
              {books.length ? (
                <label className="library-series">
                  {L('选择一本书或诗集', 'Choose a book or collection')}
                  <select value={series} onChange={(e) => setSeries(e.target.value)}>
                    <option value="all">{L('全部书籍与合集', 'All books and collections')}</option>
                    {books.map((q) => (
                      <option value={q.series} key={q.series}>
                        {L(q.series!, q.seriesEn ?? q.series!)} ·{' '}
                        {candidates.filter((v) => v.series === q.series).length}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          ) : null}
          {!compact && hidden !== null ? (
            <div className="library-listen-actions">
              <button
                className="button primary"
                disabled={!filtered.length}
                onClick={() => listening.start(filtered.map(classicListeningItem))}
              >
                <Play size={16} />
                {L('连续收听筛选结果', 'Play this selection continuously')}
              </button>
              <button
                className="button outline"
                disabled={!quietClassics(filtered).length}
                onClick={() =>
                  listening.start(quietClassics(filtered).map(classicListeningItem), undefined, {
                    sleep: true,
                    minutes: 30,
                  })
                }
              >
                <Moon size={16} />
                {L('睡前 30 分钟', '30-minute bedtime listen')}
              </button>
              <p className="small-note">
                {L(
                  '录音与章节分开计数；睡眠模式可选择播完某一部停止，或自行设置 1–240 分钟。',
                  'Recordings include book chapters. Sleep mode can stop after a chosen item or a 1–240 minute timer.',
                )}
              </p>
            </div>
          ) : null}
          {error ? (
            <div role="alert">
              <p>
                {L(
                  '暂时无法核对素材状态，请稍后重试。',
                  'Source availability could not be checked.',
                )}
              </p>
              <button className="button outline small" onClick={reload}>
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
                    `找到 ${filtered.length} 段原声与章节 · 已展示 ${shown.length} 段`,
                    `Found ${filtered.length} recordings / chapters · Showing ${shown.length}`,
                  )}
                </p>
              ) : null}
              <div className="classic-grid">
                {shown.map((q) => (
                  <article
                    className={
                      listening.current?.catalogId === q.id
                        ? 'classic-card is-current'
                        : 'classic-card'
                    }
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
                    <p className="classic-author">
                      {L(q.author, q.authorEn)}
                      {q.series ? ` · ${L(q.series, q.seriesEn ?? q.series)}` : ''}
                    </p>
                    <p className="classic-reader">
                      {L('原声：', 'Recording: ')}
                      {L(q.media.credit, q.media.creditEn)}
                    </p>
                    <small className="classic-source-status">
                      {q.media.duration ? `${durationLabel(q.media.duration)} · ` : ''}
                      {q.originalLanguage === 'zh'
                        ? L('中文原声', 'Chinese recording')
                        : L('英文原声', 'English recording')}
                      {health.find((h) => h.id === q.id)?.status === 'available'
                        ? L(' · 来源响应正常', ' · Source responded')
                        : ''}
                    </small>
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
                        aria-pressed={listening.current?.catalogId === q.id && listening.playing}
                      >
                        <span aria-hidden>
                          {listening.current?.catalogId === q.id && listening.playing ? (
                            <Pause size={16} />
                          ) : (
                            <Play size={16} />
                          )}
                        </span>
                        {listening.current?.catalogId === q.id && listening.playing
                          ? L('暂停收听', 'Pause listening')
                          : q.media.provider === 'youtube'
                            ? L('观看原片', 'Watch original video')
                            : L('播放原声', 'Play original recording')}
                      </button>
                      <a
                        className="text-button"
                        href={q.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {L('在原站收听 ↗', 'Listen at source ↗')}
                      </a>
                    </div>
                    {!compact ? (
                      <>
                        <p>
                          {locale === 'en' ? (q.contextEn ?? `Reflection: ${q.en}`) : q.context}
                        </p>
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
                            {L(
                              '反馈版权、出处或播放问题',
                              'Report rights, source or playback issues',
                            )}
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
                      setShelf('all');
                      setMedium('all');
                      setLength('all');
                      setQuietOnly(false);
                      setLinkedId('');
                      setQuery('');
                      setLanguage('all');
                      setKind('all');
                      setSeries('all');
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
        </>
      ) : null}
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
