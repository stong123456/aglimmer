export type Locale = 'zh' | 'en';
import english from './i18n-en.json' with { type: 'json' };
const dictionary = english as Record<string, string>;
const patterns: Array<[RegExp, string]> = [
  [/^正在等待审核$/, 'Awaiting review'],
  [/^(\d+) 条公开留言$/, '$1 public posts'],
  [/^(\d+) 年后$/, 'In $1 years'],
  [/^写给 (\d+) 年$/, 'For $1'],
  [/^(\d+) · (\d+) 年后$/, '$1 · in $2 years'],
  [/^(\d+) 段声音 · 每一段，都是那时的你$/, '$1 recordings · a voice from that moment'],
  [/^(.+)的声音档案$/, '$1’s voice archive'],
  [/^(\d+) 秒后重发$/, 'Resend in $1 seconds'],
  [/^验证码已发送到 (.+)$/, 'Code sent to $1'],
  [/^播放(.+)$/, 'Play $1'],
  [/^查看(.+)详情$/, 'Details for $1'],
  [/^进入(.+)$/, 'Enter $1'],
  [/^删除(.+)$/, 'Delete $1'],
  [/^请选择 (\d+) MB 以内的音频文件。$/, 'Choose an audio file up to $1 MB.'],
  [/^请选择不超过 (\d+) MB 的音频$/, 'Choose audio up to $1 MB'],
  [/^抽到一张：(.+)$/, 'Your prompt: $1'],
  [/^声音审核 · (\d+) 段待处理$/, 'Voice review · $1 pending'],
  [/^频道文字与图片 · (\d+) 条待处理$/, 'Channel text & images · $1 pending'],
  [/^(\d+) 分钟定时$/, '$1-minute timer'],
];
export function translate(value: string, locale: Locale): string {
  if (locale === 'en' && value === '。') return '.';
  if (locale === 'zh' || !/[\u3400-\u9fff]/.test(value)) return value;
  const normalized = value.replace(/\s+/g, ' ').trim();
  let result = dictionary[normalized];
  if (!result)
    for (const [pattern, replacement] of patterns)
      if (pattern.test(normalized)) {
        result = normalized.replace(pattern, replacement);
        break;
      }
  if (normalized.startsWith('进入') && dictionary[normalized.slice(2)])
    result = 'Enter ' + dictionary[normalized.slice(2)];
  if (!result) return value;
  return (value.match(/^\s*/)?.[0] || '') + result + (value.match(/\s*$/)?.[0] || '');
}
