'use client';
import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { SOURCE_TOPICS } from '@/lib/official-sources';
import { useClassicSources } from './classic-sources';
import { usePreferences } from './preferences';
import { useListening } from './listening-player';
export default function OfficialListening({ onReport }: { onReport: (id: string) => void }) {
  const { locale } = usePreferences(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const { officialSources, hidden } = useClassicSources(),
    listening = useListening();
  const [topic, setTopic] = useState('all'),
    [query, setQuery] = useState(''),
    [limit, setLimit] = useState(9);
  const values = officialSources.filter(
    (s) =>
      !hidden?.includes(s.id) &&
      (topic === 'all' || s.topics.includes(topic)) &&
      `${s.title} ${s.titleEn} ${s.publisher} ${s.description} ${s.descriptionEn}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <div className="official-library">
      <div className="curation-callout">
        <div>
          <strong>
            {L('把耳朵交给认真做内容的人', 'Meet people who care about good listening')}
          </strong>
          <p>
            {L(
              '精选中文官方节目入口。打开原站收听，节目版权与播放器归原发布方；这些入口不计入站内录音数量，也不加入睡眠队列。',
              'Selected official Chinese programmes. Listen on the publisher’s site. These links are counted separately from playable recordings and never enter sleep queues.',
            )}
          </p>
        </div>
      </div>
      <div className="chips" role="group" aria-label={L('节目主题', 'Programme topics')}>
        {[{ id: 'all', zh: '全部节目', en: 'All programmes' }, ...SOURCE_TOPICS].map((t) => (
          <button
            key={t.id}
            className={topic === t.id ? 'selected' : ''}
            aria-pressed={topic === t.id}
            onClick={() => {
              setTopic(t.id);
              setLimit(9);
            }}
          >
            {L(t.zh, t.en)}
          </button>
        ))}
      </div>
      <label className="official-search">
        {L('找一个愿意慢慢听的节目', 'Find a programme to spend time with')}
        <input
          type="search"
          maxLength={100}
          value={query}
          placeholder={L('节目、出版方或关键词', 'Programme, publisher or keyword')}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(9);
          }}
        />
      </label>
      <p className="small-note" role="status">
        {L(
          `${values.length} 个官方节目入口 · 原站可能需要登录、订阅或付费`,
          `${values.length} official programme links · Sign-in, subscriptions or payment may be required`,
        )}
      </p>
      <div className="classic-grid">
        {values.slice(0, limit).map((s) => (
          <article className="classic-card official-card" key={s.id}>
            <span className="topic-label">
              {s.topics
                .map((t) => SOURCE_TOPICS.find((x) => x.id === t))
                .filter(Boolean)
                .map((t) => L(t!.zh, t!.en))
                .join(' · ')}
            </span>
            <h3>{L(s.title, s.titleEn)}</h3>
            <p className="classic-reader">{L(s.publisher, s.publisherEn)}</p>
            <p>{L(s.description, s.descriptionEn)}</p>
            <a
              className="button outline small"
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                if (listening.playing) listening.toggle();
              }}
            >
              {L('前往官方收听', 'Listen on the official site')}
              <ArrowUpRight size={16} />
            </a>
            <details className="classic-rights">
              <summary>{L('来源与访问说明', 'Source & access details')}</summary>
              <p>{L(s.note, s.noteEn)}</p>
              <a href={s.rightsUrl} target="_blank" rel="noopener noreferrer">
                {L('查看发布方说明 ↗', 'Publisher information ↗')}
              </a>
              <p>
                {L('来源核对日期：', 'Source checked: ')}
                {s.checkedAt}
              </p>
            </details>
            <button className="text-button" onClick={() => onReport(s.id)}>
              {L('反馈出处或链接问题', 'Report source or link issues')}
            </button>
          </article>
        ))}
      </div>
      {!values.length ? (
        <p className="empty">
          {L(
            '暂时没有匹配的节目，试试其他关键词。',
            'No matching programmes. Try another keyword.',
          )}
        </p>
      ) : values.length > limit ? (
        <button className="button outline" onClick={() => setLimit((n) => n + 9)}>
          {L('再看看更多节目', 'Discover more programmes')}
        </button>
      ) : null}
    </div>
  );
}
