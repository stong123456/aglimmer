'use client';
import { useEffect, useState } from 'react';
import { LocalizedView } from './preferences';
type Request = {
  user_id: string;
  status: string;
  requested_at: string;
  nickname: string | null;
  providerUserId: string | null;
};
const labels: Record<string, string> = {
  storage: '数据库与文件存储',
  authentication: '身份服务配置',
  moderators: '线上审核管理员',
  captcha: '人机验证配置',
  emailDeliveryVerified: '真实邮件送达验收',
  restoreVerified: '备份恢复验收',
};
export default function AdminOperations({ currentUserId }: { currentUserId: string }) {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [requests, setRequests] = useState<Request[]>([]);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [removed, setRemoved] = useState(false);
  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await Promise.all(
        ['/api/admin/readiness', '/api/admin/closures'].map(async (url) => {
          const r = await fetch(url);
          const d = (await r.json()) as {
            error?: string;
            checks: Record<string, boolean>;
            requests: Request[];
          };
          if (!r.ok) throw Error(d.error || '服务暂时不可用，请稍后再试。');
          return d;
        }),
      );
      setChecks(data[0].checks);
      setRequests(data[1].requests);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function complete(userId: string) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/admin/closures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, providerRemoved: removed, confirmation }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error || '服务暂时不可用，请稍后再试。');
      setSelected('');
      setConfirmation('');
      setRemoved(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <LocalizedView>
      <section className="admin-operations">
        <details>
          <summary>站点运行与上线检查</summary>
          <p>身份服务配置不等于邮件已送达。送达和恢复项目仅在真实验收后，由运营者记录完成。</p>
          <ul className="readiness-list">
            {Object.entries(checks).map(([key, ok]) => (
              <li key={key}>
                <span>{labels[key]}</span>
                <strong className={ok ? 'check-ok' : 'check-pending'}>
                  {ok ? '已就绪' : '待完成'}
                </strong>
              </li>
            ))}
          </ul>
        </details>
        <details>
          <summary>账户注销申请</summary>
          <p>
            先在 Supabase Authentication
            删除对应用户，再清理本站数据。清理中断后可重试；不得处理没有用户申请的账户。
          </p>
          {requests.map((r) => (
            <article className="closure-request" key={r.user_id}>
              <strong data-original>{r.nickname || r.user_id}</strong>
              <p>
                <span data-original>{r.user_id}</span> ·{' '}
                {r.status === 'processing' ? '正在清理' : '待处理'}
              </p>
              <p>
                Supabase 用户编号：
                <span data-original={!!r.providerUserId}>{r.providerUserId || '无身份映射'}</span>
              </p>
              {r.user_id === currentUserId ? (
                <p>请由另一位管理员处理你的注销申请。</p>
              ) : selected !== r.user_id ? (
                <button
                  className="button outline small"
                  onClick={() => {
                    setSelected(r.user_id);
                    setConfirmation('');
                    setRemoved(false);
                  }}
                >
                  查看处理确认
                </button>
              ) : (
                <div className="closure-form">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={removed}
                      onChange={(e) => setRemoved(e.target.checked)}
                    />
                    我已在 Supabase 删除对应登录身份。
                  </label>
                  <label>
                    输入 DELETE 永久清理本站数据
                    <input
                      aria-label="管理员删除确认词"
                      autoComplete="off"
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                    />
                  </label>
                  <button
                    className="button outline small danger"
                    disabled={busy || !removed || confirmation !== 'DELETE'}
                    onClick={() => void complete(r.user_id)}
                  >
                    {r.status === 'processing' ? '重试清理' : '确认处理注销'}
                  </button>
                  <button className="text-button" disabled={busy} onClick={() => setSelected('')}>
                    取消
                  </button>
                </div>
              )}
            </article>
          ))}
          {!loading && !requests.length && !error ? <p>当前没有待处理的注销申请。</p> : null}
        </details>
        {loading ? <p role="status">正在检查运行状态…</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        <button className="text-button" disabled={loading || busy} onClick={() => void load()}>
          刷新运行与注销状态
        </button>
      </section>
    </LocalizedView>
  );
}
