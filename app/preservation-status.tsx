'use client';
import { useEffect, useState } from 'react';
import { usePreferences } from './preferences';
export default function PreservationStatus() {
  const { locale } = usePreferences(),
    [state, setState] = useState<{ kind: string; status: string; updated_at: string }[] | null>(
      null,
    ),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh);
  useEffect(() => {
    const ac = new AbortController();
    fetch('/api/preservation', { signal: ac.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((d) =>
        setState((d as { runs: { kind: string; status: string; updated_at: string }[] }).runs),
      )
      .catch(() => {});
    return () => ac.abort();
  }, []);
  return (
    <div className="preservation-status">
      <strong>{L('恢复副本运行状态', 'Recovery snapshot status')}</strong>
      {['backup', 'drill'].map((kind) => {
        const r = state?.find((x) => x.kind === kind);
        return (
          <p key={kind}>
            {L(
              kind === 'backup' ? '最近备份' : '最近样本还原校验',
              kind === 'backup' ? 'Latest backup' : 'Latest sample restore check',
            )}
            ：
            {r
              ? `${r.status === 'complete' ? L('完成', 'Complete') : r.status === 'failed' ? L('需处理', 'Needs attention') : L('进行中', 'In progress')} · ${new Date(r.updated_at).toLocaleString(locale === 'en' ? 'en-GB' : 'zh-CN', { timeZone: 'Asia/Shanghai' })}`
              : L('尚无完成记录', 'No completed run recorded')}
          </p>
        );
      })}
      <small>
        {L(
          '同站点加密副本，保留 7 天；不等于异地备份或永久保存。',
          'Encrypted copies in the same site, retained for 7 days; not an independent or permanent archive.',
        )}
      </small>
    </div>
  );
}
