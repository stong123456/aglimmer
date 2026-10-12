'use client';
import { useState } from 'react';
import { type Voice, dateLabel } from '@/lib/shared';

const NEEDS = [
  { label: '歇一会儿', mood: '有点累', note: '不急着振作。先让自己安静地停一会儿。' },
  { label: '借一点勇气', mood: '需要勇气', note: '迈出很小的一步，也值得被看见。' },
  { label: '重新出发', mood: '重新开始', note: '从今天开始，按照自己的节奏慢慢来。' },
];
export function GentleListening({
  voices,
  playingId,
  onPlay,
}: {
  voices: Voice[];
  playingId?: string;
  onPlay: (voice: Voice) => void;
}) {
  const [need, setNeed] = useState(0);
  const [offset, setOffset] = useState(0);
  const matching = voices.filter((v) => v.mood === NEEDS[need].mood);
  const list = matching.slice(offset, offset + 3);
  return (
    <section className="gentle-session" aria-label="给此刻的你">
      <div className="section-heading">
        <div>
          <span className="handwritten">留一点时间给自己</span>
          <h2>给此刻的你</h2>
          <p>选一种陪伴，听几句话。想停下的时候，随时可以。</p>
        </div>
      </div>
      <div className="chips" role="group" aria-label="选择陪伴">
        <>
          {NEEDS.map((n, i) => (
            <button
              key={n.mood}
              aria-pressed={need === i}
              className={need === i ? 'selected' : ''}
              onClick={() => {
                setNeed(i);
                setOffset(0);
              }}
            >
              {n.label}
            </button>
          ))}
        </>
      </div>
      <p className="session-note">{NEEDS[need].note}</p>
      <div className="session-list">
        {list.map((v, i) => (
          <button
            key={v.id}
            className={playingId === v.id ? 'session-track active' : 'session-track'}
            onClick={() => onPlay(v)}
            aria-label={`播放${v.title}`}
          >
            <span className="session-index">0{i + 1}</span>
            <span>
              <strong>{v.title}</strong>
              <small>
                {v.signature} · {v.demo ? 'AI 示例朗读' : dateLabel(v.recordedAt)}
              </small>
            </span>
            <span aria-hidden="true">▷</span>
          </button>
        ))}
      </div>
      {!list.length && <p role="status">这个角落还在等第一束光。可以先听听声音墙里的其他陪伴。</p>}
      {matching.length > 3 && (
        <button
          className="text-button"
          onClick={() => setOffset(offset + 3 >= matching.length ? 0 : offset + 3)}
        >
          换几段声音 →
        </button>
      )}
      <p className="small-note">点击才播放，每段结束后由你选择下一段。</p>
    </section>
  );
}
export const ANNUAL_QUESTIONS = [
  '今年的你，最想感谢谁？',
  '最近有什么小事，让你觉得生活还有一点光？',
  '现在的你，想对去年的自己说什么？',
];
export function VoiceRings({
  voices,
  onStart,
  onPlay,
}: {
  voices: Voice[];
  onStart: (question: string, previous?: Voice) => void;
  onPlay: (v: Voice) => void;
}) {
  return (
    <section className="voice-rings" aria-label="声音年轮">
      <span className="handwritten">同一个问题，不同年份的你</span>
      <h2>声音年轮</h2>
      <p>每年回答一次。慢慢听见自己怎样改变。</p>
      <div className="ring-grid">
        {ANNUAL_QUESTIONS.map((q) => {
          const entries = voices
            .filter((v) => v.title === q)
            .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
          return (
            <article className="ring-card" key={q}>
              <h3>{q}</h3>
              <div className="ring-history">
                {entries.length ? (
                  entries.map((v) => (
                    <button key={v.id} onClick={() => onPlay(v)}>
                      {dateLabel(v.recordedAt)} · 听当年的我 ▷
                    </button>
                  ))
                ) : (
                  <p>第一圈年轮，从今天开始。</p>
                )}
              </div>
              <button className="button outline small" onClick={() => onStart(q, entries.at(-1))}>
                {entries.length ? '留下这次的回答' : '录下第一年的回答'}
              </button>
              <small>默认仅自己可见 · 日期与署名随录音保存</small>
            </article>
          );
        })}
      </div>
      <p className="small-note">
        年轮通过相同问题和独立录音整理，不会覆盖过去的回答。回听提醒尚未启用。
      </p>
    </section>
  );
}
