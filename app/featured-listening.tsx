'use client';
import { ArrowRight, Moon, Play, Sparkles, Headphones } from 'lucide-react';
import { type ClassicQuote } from '@/lib/quotes';
import { classicListeningItem } from '@/lib/listening';
import { quietChinese, orderedSelection, COURAGE_IDS, LONG_STORY_IDS } from '@/lib/curation';
import { durationLabel } from '@/lib/shared';
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
    night = quietChinese(available),
    bedtime = quietClassics(night);
  const selections = [
    {
      id: 'night',
      title: L('听一段中文故事与散文', 'Chinese stories and essays'),
      text: L(
        '从一段日常出发，把节奏慢下来。真人原声，保留朗读者署名。',
        'Everyday moments at an unhurried pace, with original readers credited.',
      ),
      label: L('连续听中文选读', 'Listen to Chinese readings'),
      icon: Moon,
      values: night,
      sleep: false,
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
      values: orderedSelection(available, COURAGE_IDS),
      sleep: false,
    },
    {
      id: 'stories',
      title: L('在故事里，多停留一会儿', 'Stay a little longer in a story'),
      text: L(
        '中文成人经典，留给想慢慢听完一个故事的时刻。',
        'Chinese classics for adults, for moments when a story deserves your time.',
      ),
      label: L('走进长篇故事', 'Explore longer stories'),
      icon: Headphones,
      values: orderedSelection(available, LONG_STORY_IDS),
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
              <small className="selection-meta">
                {s.values.length}{' '}
                {L('段 · 自然播完停止，不循环', 'items · Stops at the end, no looping')}
              </small>
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
                      <small>
                        {locale === 'en' ? q.authorEn : q.author} ·{' '}
                        {q.media.duration
                          ? durationLabel(q.media.duration)
                          : L('官方视频', 'Official video')}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                className={s.id === 'night' ? 'button primary' : 'button outline'}
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
              {s.id === 'night' && bedtime.length ? (
                <button
                  className="text-button"
                  onClick={() =>
                    listening.start(bedtime.map(classicListeningItem), undefined, {
                      sleep: true,
                      minutes: 30,
                    })
                  }
                >
                  <Moon size={15} aria-hidden />
                  {L('睡前听一段散文', 'An essay before sleep')}
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
