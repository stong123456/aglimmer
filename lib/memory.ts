import type { Voice } from './shared';

export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

export function nextMemoryDate(recordedAt: string, today: string, targetYear?: number | null) {
  if (!validDate(recordedAt) || !validDate(today)) return today;
  let year = Math.max(Number(today.slice(0, 4)), targetYear ?? 0);
  const anniversary = (year: number) => {
    const month = Number(recordedAt.slice(5, 7));
    const day = Math.min(
      Number(recordedAt.slice(8, 10)),
      new Date(Date.UTC(year, month, 0)).getUTCDate(),
    );
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };
  if (anniversary(year) <= today) year++;
  return anniversary(year);
}

const escapeCalendar = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replaceAll('\\', '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,');
function foldCalendar(line: string) {
  const lines: string[] = [];
  let part = '',
    size = 0;
  for (const char of line) {
    const bytes = new TextEncoder().encode(char).length;
    if (size + bytes > 75) {
      lines.push(part);
      part = ' ';
      size = 1;
    }
    part += char;
    size += bytes;
  }
  lines.push(part);
  return lines.join('\r\n');
}
export function memoryCalendar({
  date,
  annual,
  locale,
  title,
  signature,
  now = new Date(),
}: {
  date: string;
  annual: boolean;
  locale: 'zh' | 'en';
  title?: string;
  signature?: string;
  now?: Date;
}) {
  if (
    !validDate(date) ||
    date < now.toISOString().slice(0, 10) ||
    Number(date.slice(0, 4)) > now.getUTCFullYear() + 100
  )
    throw Error('请选择今天起一百年内的有效日期。');
  const en = locale === 'en';
  const summary = title
    ? `${title} · A Glimmer`
    : en
      ? 'Listen to your past self · A Glimmer'
      : '回来听听当年的自己 · 一点光';
  const description = [
    en
      ? 'Open your private voice archive and sign in to listen.'
      : '打开你的私人声音档案，登录后重听当年的声音。',
    signature ?? '',
    'https://aglimmer.xyz/?view=archive',
  ]
    .filter(Boolean)
    .join('\n');
  const end = new Date(date + 'T00:00:00Z');
  end.setUTCDate(end.getUTCDate() + 1);
  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//A Glimmer//Voice memories//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${crypto.randomUUID()}@aglimmer.xyz`,
      `DTSTAMP:${now
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '')}`,
      `DTSTART;VALUE=DATE:${date.replaceAll('-', '')}`,
      `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replaceAll('-', '')}`,
      ...(annual ? ['RRULE:FREQ=YEARLY'] : []),
      `SUMMARY:${escapeCalendar(summary)}`,
      `DESCRIPTION:${escapeCalendar(description)}`,
      'URL:https://aglimmer.xyz/?view=archive',
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:PT9H',
      `DESCRIPTION:${escapeCalendar(summary)}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .map(foldCalendar)
      .join('\r\n') + '\r\n'
  );
}

export function annualMemories(voices: Voice[], year: string) {
  const entries = voices
    .filter((v) => !v.demo && v.recordedAt.startsWith(year + '-'))
    .sort(
      (a, b) =>
        a.recordedAt.localeCompare(b.recordedAt) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
  return {
    entries,
    seconds: entries.reduce(
      (n, v) => n + (Number.isFinite(v.duration) ? Math.max(0, v.duration) : 0),
      0,
    ),
    days: new Set(entries.map((v) => v.recordedAt)).size,
    future: entries.filter((v) => !!v.futureYear).length,
  };
}
