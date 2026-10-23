'use client';
import { ArrowRight, Moon, Play, Sparkles, Headphones } from 'lucide-react';
import { type ClassicQuote } from '@/lib/quotes';
import { classicListeningItem } from '@/lib/listening';
import { usePreferences } from './preferences';
import { useClassicSources } from './classic-sources';
import { useListening } from './listening-player';
export function quietClassics(values: ClassicQuote[]): ClassicQuote[] {
  return values.filter(
    (q) =>
      q.media.provider === 'archive' &&
      q.sleepSuitable !== false &&
      (q.sleepSuitable === true || q.theme === 'rest'),
  );
}
export default function FeaturedListening({ onExplore }: { onExplore: () => void }) {
  const { locale } = usePreferences(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const { hidden, error, reload, catalog } = useClassicSources(),
    listening = useListening();
  const available = (catalog ?? []).filter((q) => !hidden?.includes(q.id)),
    night = quietClassics(available);
  const selections = [
    {
      id: 'night',
      title: L('今晚，安心慢慢听', 'A quieter end to your day'),
      text: L(
        '经典原声与诗词，30 分钟后停下来。',
        'Classic readings and poetry. Stops after 30 minutes.',
      ),
      label: L('睡前 30 分钟', '30-minute bedtime listen'),
      icon: Moon,
      values: night,
      sleep: true,
    },
    {
      id: 'courage',
      title: L('借一点向前的勇气', 'Borrow a little courage'),
      text: L(
        '从一句共鸣，到一场值得听完的演讲。',
        'From a resonant line to a talk worth finishing.',
      ),
      label: L('连续收听', 'Listen continuously'),
      icon: Sparkles,
      values: available.filter((q) => q.theme === 'courage'),
      sleep: false,
    },
    {
      id: 'poetry',
      title: L('给心留一首诗', 'A little poetry for the heart'),
      text: L(
        '中英文经典，跟着声音看见更远的风景。',
        'Chinese and English classics, one voice at a time.',
      ),
      label: L('开始诗词漫游', 'Begin a poetry journey'),
      icon: Headphones,
      values: available.filter((q) => q.kind === 'poetry' && q.sleepSuitable !== false),
      sleep: false,
    },
  ];
  return (
    <section className="featured-listening" aria-label={L('首页精选原声', 'Featured listening')}>
      <div className="section-heading">
        <div>
          <span className="handwritten">
            {L('一点光 · 原声精选', 'A Glimmer · Selected voices')}
          </span>
          <h2>{L('好声音，值得慢慢听。', 'Good voices deserve a little time.')}</h2>
          <p>
            {hidden === null
              ? L('正在打开原声书架…', 'Opening the original-audio collection…')
              : L(
                  `${available.length} 段原声与章节 · 诗词、故事与演讲 · 保留原始出处`,
                  `${available.length} recordings and chapters · Poetry, stories and talks · Original sources`,
                )}
          </p>
        </div>
        <button className="text-button" onClick={onExplore}>
          {L('探索慢慢听', 'Explore slow listening')} <ArrowRight size={17} />
        </button>
      </div>
      {error && hidden === null ? (
        <button className="text-button" onClick={reload}>
          {L('重新打开精选', 'Reload selections')}
        </button>
      ) : (
        <div className="featured-listening-grid">
          {selections.map((s) => (
            <article key={s.id} className={'featured-listen-card ' + s.id}>
              <s.icon size={24} aria-hidden />
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              <ul className="featured-work-list">
                {s.values.slice(0, 3).map((q) => (
                  <li key={q.id}>
                    <button
                      onClick={() =>
                        listening.start(s.values.map(classicListeningItem), 'classic:' + q.id, {
                          sleep: s.sleep,
                          minutes: s.sleep ? 30 : undefined,
                        })
                      }
                    >
                      <Play size={12} aria-hidden />
                      <span>{locale === 'en' ? q.workEn : q.work}</span>
                      <small>{locale === 'en' ? q.authorEn : q.author}</small>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                className={s.sleep ? 'button primary' : 'button outline'}
                disabled={hidden === null || !s.values.length}
                onClick={() =>
                  listening.start(s.values.map(classicListeningItem), undefined, {
                    sleep: s.sleep,
                    minutes: s.sleep ? 30 : undefined,
                  })
                }
              >
                <Play size={16} aria-hidden />
                {s.label}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
