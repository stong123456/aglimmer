'use client';
import { useEffect, useState } from 'react';
import { LocalizedView, usePreferences } from './preferences';
type Closure = { status: string; requested_at: string; updated_at: string } | null;
export default function AccountClosure({
  userId,
  administrator = false,
}: {
  userId: string;
  administrator?: boolean;
}) {
  const { t } = usePreferences();
  const [request, setRequest] = useState<Closure>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState(''),
    [exported, setExported] = useState(false);
  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/me/closure');
      const d = (await r.json()) as { error?: string; request: Closure };
      if (!r.ok) throw Error(d.error || '无法读取注销申请，请重试。');
      setRequest(d.request);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    setConfirmation('');
    setExported(false);
    void load();
  }, [userId]);
  async function change(cancel: boolean) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await fetch('/api/me/closure', {
        method: cancel ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: cancel ? undefined : JSON.stringify({ confirmation }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error || '暂时无法完成，请稍后再试。');
      await load();
      setConfirmation('');
      setExported(false);
      setNotice(cancel ? '注销申请已撤回。' : '注销申请已提交，等待运营者处理。');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const active = request && ['requested', 'processing'].includes(request.status);
  return (
    <LocalizedView>
      <div className="account-privacy">
        <h3>账户编号</h3>
        <p>申请管理员或反馈账户问题时，可以提供这个编号。它不包含邮箱和登录凭据。</p>
        <div className="account-id-row">
          <input readOnly aria-label="账户编号" value={userId} />
          <button
            className="button outline small"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(userId);
                setNotice('账户编号已复制。');
              } catch {
                setError('复制失败，请手动复制账户编号。');
              }
            }}
          >
            {t('复制编号')}
          </button>
        </div>
        <details className="closure-details">
          <summary>申请注销本站账户</summary>
          {administrator ? <p>管理员注销前，请先确保还有另一位管理员能处理申请。</p> : null}
          <p>请先完整导出需要保留的声音。申请不会立即删除数据，运营者开始处理前可以撤回。</p>
          <p>
            处理完成后，本站资料、声音、图片和收藏将被删除，无法恢复。登录身份由运营者在 Supabase
            同步删除；历史备份按备份清理流程处理。
          </p>
          {loading ? (
            <p role="status">正在读取申请状态…</p>
          ) : error ? null : active ? (
            <div>
              <p role="status">
                {request.status === 'processing'
                  ? '注销正在处理，已无法撤回。'
                  : '注销申请待处理，仍可导出档案或撤回申请。'}
              </p>
              {request.status === 'requested' ? (
                <button
                  className="button outline small"
                  disabled={busy}
                  onClick={() => void change(true)}
                >
                  撤回注销申请
                </button>
              ) : null}
            </div>
          ) : (
            <div className="closure-form">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={exported}
                  onChange={(e) => setExported(e.target.checked)}
                />
                我已导出需要保留的档案，理解处理后无法恢复。
              </label>
              <label>
                输入 CLOSE 确认申请
                <input
                  aria-label="注销确认词"
                  autoComplete="off"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </label>
              <button
                className="button outline small danger"
                disabled={busy || !exported || confirmation !== 'CLOSE'}
                onClick={() => void change(false)}
              >
                提交注销申请
              </button>
            </div>
          )}
        </details>
        {error ? (
          <div role="alert">
            <p>{error}</p>
            <button className="text-button" disabled={busy} onClick={() => void load()}>
              重新读取
            </button>
          </div>
        ) : null}
        {notice ? <p role="status">{notice}</p> : null}
      </div>
    </LocalizedView>
  );
}
