'use client';
import { useEffect, useState } from 'react';
import { usePreferences } from './preferences';
type Run = {
  id: string;
  kind: string;
  status: string;
  updated_at: string;
  summary: { error?: string; sampleKind?: string };
};
type State = {
  configured: boolean;
  runs: Run[];
  sources: { status: string; count: number }[];
  issues: { id: string; status: string; note: string; failures: number }[];
};
export default function MaintenancePanel() {
  const { locale } = usePreferences(),
    L = (zh: string, en: string) => (locale === 'en' ? en : zh),
    [state, setState] = useState<State | null>(null),
    [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  async function load() {
    const r = await fetch('/api/admin/maintenance');
    if (!r.ok) throw Error(L('维护状态暂不可用', 'Maintenance status is unavailable'));
    setState((await r.json()) as State);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function run(action: string) {
    setBusy(action);
    setError('');
    try {
      for (let i = 0; i < (action === 'backup' ? 80 : 1); i++) {
        const r = await fetch('/api/admin/maintenance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        const d = (await r.json()) as { error?: string; status?: string };
        if (!r.ok) throw Error(d.error);
        if (action !== 'backup' || d.status === 'complete' || d.status === 'busy') break;
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load().catch(() => {});
    } finally {
      setBusy('');
    }
  }
  return (
    <details className="maintenance-panel">
      <summary>
        {L(
          '音源巡检、加密备份与恢复校验',
          'Source checks, encrypted backups and restore verification',
        )}
      </summary>
      <p>
        {L(
          '每天生成站内加密恢复副本，保留7天，最多256MB。分块校验原始字节，不覆盖原录音；不是跨账号备份。',
          'Daily encrypted recovery copies inside this site, retained for 7 days, capped at 256 MB. Chunk checks preserve original bytes. This is not an independent backup.',
        )}
      </p>
      <p>
        {L(
          '仅连续两次404/410且间隔至少6小时才自动暂停素材；网络超时、403和限流需人工判断。',
          'Only repeated 404/410 responses at least 6 hours apart pause a source. Timeouts, 403s and rate limits require review.',
        )}
      </p>
      {state ? (
        <>
          <p>
            {L('后台维护凭证', 'Maintenance access')}：
            {state.configured ? L('已配置', 'Configured') : L('待配置', 'Not configured')}
          </p>
          <div className="chips">
            {[
              ['sources', '运行一批音源巡检', 'Check a source batch'],
              ['backup', '运行今日备份', 'Run today’s backup'],
              ['drill', '运行样本恢复校验', 'Run a sample restore check'],
            ].map(([action, zh, en]) => (
              <button key={action} disabled={!!busy} onClick={() => void run(action)}>
                {busy === action ? L('执行中…', 'Running…') : L(zh, en)}
              </button>
            ))}
          </div>
          <ul>
            {state.sources.map((s) => (
              <li key={s.status}>
                {s.status}: {s.count}
              </li>
            ))}
          </ul>
          {state.runs.slice(0, 8).map((r) => (
            <p key={r.id}>
              {r.kind} · {r.status} ·{' '}
              {new Date(r.updated_at).toLocaleString(locale === 'en' ? 'en-GB' : 'zh-CN', {
                timeZone: 'Asia/Shanghai',
              })}
              {r.summary.error ? <strong role="alert"> · {r.summary.error}</strong> : null}
              {r.kind === 'drill' ? (
                <small>
                  {' '}
                  ·{' '}
                  {r.summary.sampleKind === 'original-object'
                    ? L('原文件样本已还原', 'An original sample restored')
                    : L(
                        '无合适样本时仅校验加密流程；不算完整原文件恢复',
                        'Without an eligible sample, only the encrypted recovery path is checked',
                      )}
                </small>
              ) : null}
            </p>
          ))}
          {state.issues.length ? (
            <details>
              <summary>{L('需要核对的音源', 'Sources needing review')}</summary>
              {state.issues.map((s) => (
                <p key={s.id}>
                  {s.id} · {s.status} · {s.note} ({s.failures})
                </p>
              ))}
            </details>
          ) : null}
        </>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <button
        className="text-button"
        disabled={!!busy}
        onClick={() => void load().catch((e) => setError(e.message))}
      >
        {L('刷新维护状态', 'Refresh maintenance status')}
      </button>
    </details>
  );
}
