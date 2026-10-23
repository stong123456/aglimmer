'use client';
import { useState } from 'react';
import { CalendarDays, Download, Play } from 'lucide-react';
import { LocalizedView, usePreferences } from './preferences';
import { annualMemories, memoryCalendar, nextMemoryDate } from '@/lib/memory';
import { dateLabel, durationLabel, type Voice } from '@/lib/shared';
import { download } from '@/lib/zip';

const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export function CalendarReminder({ voice }: { voice?: Voice }) {
  const { locale } = usePreferences();
  const [date, setDate] = useState(() =>
    nextMemoryDate(voice?.recordedAt ?? today(), today(), voice?.futureYear),
  );
  const [annual, setAnnual] = useState(!voice?.futureYear);
  const [includeDetails, setIncludeDetails] = useState(false);
  const [message, setMessage] = useState('');
  function save() {
    try {
      const calendar = memoryCalendar({
        date,
        annual,
        locale,
        ...(includeDetails && voice ? { title: voice.title, signature: voice.signature } : {}),
      });
      download(
        new Blob([calendar], { type: 'text/calendar;charset=utf-8' }),
        `A-Glimmer-${date}.ics`,
      );
      setMessage('日历文件已生成，请打开并确认加入你的日历。提醒由日历应用管理，可以随时删除。');
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <LocalizedView>
      <details className="memory-reminder">
        <summary>
          <CalendarDays size={17} aria-hidden /> 把回听的日子，交给日历
        </summary>
        <p>一年后，或十年后的某一天，回来听听现在的自己。</p>
        <div className="memory-calendar-fields">
          <label>
            哪一天回来听？
            <input
              type="date"
              value={date}
              min={today()}
              max={`${new Date().getUTCFullYear() + 100}-12-31`}
              onChange={(e) => {
                setDate(e.target.value);
                setMessage('');
              }}
            />
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={annual} onChange={(e) => setAnnual(e.target.checked)} />
            每年在这一天提醒我
          </label>
        </div>
        {voice ? (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={includeDetails}
              onChange={(e) => setIncludeDetails(e.target.checked)}
            />
            在日历中包含录音标题和署名（可能同步至日历服务）
          </label>
        ) : null}
        <p className="small-note">
          默认不包含录音内容、标题和署名。只下载日历文件，不发送邮件；日历不会获得私密音频的访问权限。
        </p>
        <button className="button outline small" onClick={save}>
          <Download size={16} aria-hidden />
          下载回听提醒
        </button>
        {message ? <p role="status">{message}</p> : null}
      </details>
    </LocalizedView>
  );
}

export function AnnualRecap({
  voices,
  onPlay,
  onOpen,
}: {
  voices: Voice[];
  onPlay: (v: Voice) => void;
  onOpen: (v: Voice) => void;
}) {
  const { locale } = usePreferences();
  const years = [...new Set(voices.filter((v) => !v.demo).map((v) => v.recordedAt.slice(0, 4)))]
    .sort()
    .reverse();
  const [selected, setSelected] = useState('');
  const year = years.includes(selected) ? selected : years[0];
  if (!year) return null;
  const recap = annualMemories(voices, year),
    first = recap.entries[0],
    last = recap.entries.at(-1)!;
  const milestones = first.id === last.id ? [first] : [first, last];
  function save() {
    const en = locale === 'en';
    const lines = [
      `${year} · ${en ? 'My year in voices' : '我的声音年记'}`,
      en
        ? `${recap.entries.length} recordings · ${recap.days} days · ${durationLabel(recap.seconds)}`
        : `${recap.entries.length} 段声音 · ${recap.days} 个有声音的日子 · 共 ${durationLabel(recap.seconds)}`,
      '',
      ...recap.entries.map(
        (v) =>
          `${dateLabel(v.recordedAt)} · ${v.title}\n${v.signature} · ${durationLabel(v.duration)}${v.futureYear ? ` · ${v.futureYear}` : ''}`,
      ),
      '',
      en
        ? 'This personal recap contains titles and signatures. Original audio is available through the full archive export.'
        : '这份个人年记包含标题与署名。原音频请使用完整导出档案另行保存。',
    ];
    download(
      new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }),
      `A-Glimmer-${year}.txt`,
    );
  }
  return (
    <LocalizedView>
      <section className="annual-recap" aria-label="我的声音年记">
        <div className="recap-heading">
          <div>
            <span className="handwritten">时间走过，声音留下</span>
            <h2>我的声音年记</h2>
          </div>
          <label>
            回顾哪一年？
            <select value={year} onChange={(e) => setSelected(e.target.value)}>
              {years.map((y) => (
                <option value={y} key={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p>
          {locale === 'en'
            ? `${year}: ${recap.entries.length} recordings across ${recap.days} days · ${durationLabel(recap.seconds)} of your voice.`
            : `${year} 年，你在 ${recap.days} 个日子里，留下了 ${recap.entries.length} 段声音，共 ${durationLabel(recap.seconds)}。`}
        </p>
        <div className="recap-milestones">
          {milestones.map((v, i) => (
            <article key={v.id}>
              <small>
                {i === 0 ? '这一年的第一段声音' : '这一年的最近一段声音'} ·{' '}
                {dateLabel(v.recordedAt)}
              </small>
              <h3 data-original>{v.title}</h3>
              <p data-original>{v.signature}</p>
              <button className="button outline small" onClick={() => onPlay(v)}>
                <Play size={16} aria-hidden />
                听听当时的我
              </button>
              <button className="text-button" onClick={() => onOpen(v)}>
                看看这段记忆 →
              </button>
            </article>
          ))}
        </div>
        <p className="small-note">
          根据你填写的录制日期整理，仅自己可见。下载的年记包含标题与署名，请妥善保存。
        </p>
        <button className="text-button" onClick={save}>
          <Download size={16} aria-hidden />
          下载这一年的声音年记
        </button>
        <CalendarReminder />
      </section>
    </LocalizedView>
  );
}
