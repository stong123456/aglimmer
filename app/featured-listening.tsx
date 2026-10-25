'use client';
import { ArrowRight, Moon, Play, Sparkles, Film } from 'lucide-react';
import { type ClassicQuote } from '@/lib/quotes';
import { classicListeningItem } from '@/lib/listening';
import { quietChinese, orderedSelection, COURAGE_IDS, CHINESE_LIFE_IDS } from '@/lib/curation';
import {
  isBedtimeRecording,
  LIBRARY_SHELVES,
  matchesShelf,
  librarySummary,
} from '@/lib/library-discovery';
import { durationLabel } from '@/lib/shared';
import { usePreferences } from './preferences';
import { useClassicSources } from './classic-sources';
import { useListening } from './listening-player';
export function quietClassics(values: ClassicQuote[]): ClassicQuote[] {
  return values.filter(isBedtimeRecording);
}
export default function FeaturedListening({
  onExplore,
}: {
  onExplore: (params?: Record<string, string>) => void;
}) {
  const { locale } = usePreferences(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  const { hidden, error, reload, catalog, officialSources } = useClassicSources(),
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
      title: L('看看普通人，如何把日子过成光', 'Small lives, quietly luminous'),
      text: L(
        '从退休后画画，到两个人一起做陶。来自一条Yit官方的中文人物短片，保留原片画面。',
        'Chinese life films from the official Yit channel: art, craft and everyday companionship, shown with their original picture.',
      ),
      label: L('观看生活微纪录', 'Watch everyday life films'),
      icon: Film,
      values: orderedSelection(available, CHINESE_LIFE_IDS),
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
                  `${available.length} 段原声与章节 · 故事、散文、生活短片与演讲`,
                  `${available.length} recordings / chapters · Stories, essays, life films and talks`,
                )}
          </p>
        </div>
        <button className="text-button" onClick={() => onExplore()}>
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
      {hidden !== null ? (
        <div className="discovery-strip">
          <div>
            <strong>{L('总有一个书架，适合此刻的你', 'A shelf for the moment you are in')}</strong>
            <p className="small-note">
              {librarySummary(available).books}{' '}
              {L(
                '本书与录音合集，按章节慢慢听',
                'books & audio collections to explore chapter by chapter',
              )}
            </p>
          </div>
          <div className="chips">
            {LIBRARY_SHELVES.filter((s) => s.id !== 'all').map((s) => (
              <button key={s.id} onClick={() => onExplore({ shelf: s.id })}>
                {L(s.zh, s.en)}{' '}
                <small>{available.filter((q) => matchesShelf(q, s.id)).length}</small>
              </button>
            ))}
            <button onClick={() => onExplore({ sources: 'official' })}>
              {L('官方中文好节目', 'Official Chinese programmes')} ↗{' '}
              <small>{officialSources.filter((s) => !hidden.includes(s.id)).length}</small>
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
