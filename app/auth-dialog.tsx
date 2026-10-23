'use client';
import { LocalizedView } from './preferences';
import { useEffect, useRef, useState } from 'react';
import { normalizeEmail, validOtp } from '@/lib/auth-core';
async function api(path: string, body?: unknown) {
  const r = await fetch(
    path,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const d = (await r.json()) as any;
  if (!r.ok) throw new Error(d.error ?? '暂时无法完成，请稍后再试。');
  return d;
}
export default function AuthDialog({
  onClose,
  onComplete,
  onRules,
}: {
  onClose: () => void;
  onComplete: () => Promise<void>;
  onRules: () => void;
}) {
  const [email, setEmail] = useState(''),
    [code, setCode] = useState(''),
    [nickname, setNickname] = useState(''),
    [step, setStep] = useState<'email' | 'code' | 'welcome'>('email'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [sent, setSent] = useState(false),
    [cooldown, setCooldown] = useState(0),
    [config, setConfig] = useState<{
      ready: boolean;
      captchaSiteKey: string;
      localDemo: boolean;
    } | null>(null),
    [captcha, setCaptcha] = useState('');
  const busyRef = useRef(false);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  const dialog = useRef<HTMLElement>(null),
    captchaBox = useRef<HTMLDivElement>(null),
    widget = useRef<string | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) onClose();
      if (e.key === 'Tab') {
        const controls = dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a,input',
        );
        if (controls?.length) {
          const first = controls[0],
            last = controls[controls.length - 1];
          if (
            e.shiftKey &&
            (document.activeElement === first || document.activeElement === dialog.current)
          ) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  useEffect(() => {
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [step]);
  useEffect(() => {
    api('/api/auth/status')
      .then(setConfig)
      .catch(() => setError('暂时无法连接登录服务，请稍后再试。'));
  }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown > 0]);
  useEffect(() => {
    if (!config?.captchaSiteKey || step === 'welcome') return;
    let stopped = false;
    const render = () => {
      const turnstile = (window as any).turnstile;
      if (stopped || !turnstile || !captchaBox.current) return;
      widget.current = turnstile.render(captchaBox.current, {
        sitekey: config.captchaSiteKey,
        theme: 'light',
        callback: (token: string) => setCaptcha(token),
        'expired-callback': () => setCaptcha(''),
        'error-callback': () => {
          setCaptcha('');
          setError('人机验证暂时不可用，请重试。');
        },
      });
    };
    let script = document.querySelector<HTMLScriptElement>('script[data-aglimmer-turnstile]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.dataset.aglimmerTurnstile = '1';
      document.head.appendChild(script);
    }
    if ((window as any).turnstile) render();
    else script.addEventListener('load', render);
    return () => {
      stopped = true;
      script?.removeEventListener('load', render);
      if (widget.current && (window as any).turnstile) {
        (window as any).turnstile.remove(widget.current);
        widget.current = null;
      }
    };
  }, [config?.captchaSiteKey, step]);
  function resetCaptcha() {
    if (widget.current && (window as any).turnstile)
      (window as any).turnstile.reset(widget.current);
    setCaptcha('');
  }
  async function send() {
    const normalized = normalizeEmail(email);
    if (!normalized) {
      setError('请填写有效的邮箱地址。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/send', { email: normalized, captchaToken: captcha });
      setEmail(normalized);
      setSent(true);
      setStep('code');
      setCooldown(60);
      setCode('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      resetCaptcha();
    }
  }
  async function verify() {
    if (!validOtp(code)) {
      setError('请填写邮件中的完整数字验证码。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const d = await api('/api/auth/verify', { email, token: code });
      if (d.isNew) {
        setNickname('');
        setStep('welcome');
      } else await onComplete();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    setBusy(true);
    setError('');
    try {
      if (nickname.trim()) {
        const r = await fetch('/api/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nickname: nickname.trim() }),
        });
        const d = (await r.json()) as any;
        if (!r.ok) throw new Error(d.error);
      }
      await onComplete();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function local() {
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/local', {});
      await onComplete();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <LocalizedView>
      {
        <div
          className="modal-backdrop auth-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) onClose();
          }}
        >
          <section
            className="auth-dialog"
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
            tabIndex={-1}
          >
            <button
              className="modal-close icon-button"
              aria-label="关闭登录窗口"
              onClick={onClose}
              disabled={busy}
            >
              ×
            </button>
            <div className="auth-brand">
              ☼{' '}
              <span>
                一点光<small>A Glimmer</small>
              </span>
            </div>
            <h2 id="auth-title">
              {step === 'welcome'
                ? '以后，该怎么称呼你？'
                : step === 'code'
                  ? '一封邮件，带你回来。'
                  : '给你的声音，\n一个能回来的地方。'}
            </h2>
            <p className="auth-subtitle">
              {step === 'welcome'
                ? '给自己选一个署名，不必使用真实姓名。'
                : step === 'code'
                  ? `验证码已发送到 ${email}。`
                  : '输入邮箱，登录或建立你的声音档案。无需密码。'}
            </p>
            {step === 'email' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <label>
                  你的邮箱
                  <input
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    maxLength={254}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError('');
                    }}
                    required
                  />
                </label>
                {config?.captchaSiteKey ? <div ref={captchaBox} className="auth-captcha" /> : null}
                <button
                  className="button primary auth-primary"
                  type="submit"
                  disabled={busy || !config?.ready || (!!config?.captchaSiteKey && !captcha)}
                >
                  {busy ? '正在发送…' : config === null ? '正在连接…' : '获取验证码'} →
                </button>
                <p className="auth-consent">
                  继续即表示同意{' '}
                  <button type="button" className="inline-link" onClick={onRules}>
                    社区与保存约定
                  </button>
                  。你的邮箱不会公开。
                </p>
              </form>
            ) : step === 'code' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void verify();
                }}
              >
                <label>
                  邮箱验证码
                  <input
                    className="otp-input"
                    type="text"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="([0-9]{6}|[0-9]{8})"
                    maxLength={8}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.replace(/\D/g, ''));
                      setError('');
                    }}
                    placeholder="00000000"
                    required
                  />
                </label>
                <button className="button primary auth-primary" disabled={busy} type="submit">
                  {busy ? '正在验证…' : '登录 / 建立档案'} →
                </button>
                <div className="auth-code-actions">
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy || cooldown > 0}
                    onClick={send}
                  >
                    {cooldown > 0 ? `${cooldown} 秒后可重发` : '重新发送验证码'}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      setStep('email');
                      setSent(false);
                      setError('');
                    }}
                  >
                    换一个邮箱
                  </button>
                </div>
                {config?.captchaSiteKey ? <div ref={captchaBox} className="auth-captcha" /> : null}
                <p className="small-note">
                  没找到邮件？看看垃圾邮件文件夹。请使用最新收到的验证码。
                </p>
              </form>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void finish();
                }}
              >
                <label>
                  你的署名
                  <input
                    maxLength={24}
                    autoComplete="nickname"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="比如：小满、远山、今天的我"
                  />
                </label>
                <button className="button primary auth-primary" disabled={busy} type="submit">
                  {busy ? '正在保存…' : '进入我的声音世界'} →
                </button>
                <button
                  className="text-button auth-skip"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void onComplete();
                  }}
                >
                  先用默认署名，之后再改
                </button>
              </form>
            )}
            {error ? (
              <p className="auth-error" role="alert">
                {error}
              </p>
            ) : null}
            {config && !config.ready && step === 'email' ? (
              <div className="auth-setup-note">
                <strong>邮箱登录正在准备中</strong>
                <p>平台和发信域名接通后即可使用，当前不会发送验证码邮件。</p>
                {config.localDemo ? (
                  <button className="text-button" disabled={busy} onClick={local}>
                    使用本地演示账户（不发送邮件） →
                  </button>
                ) : null}
              </div>
            ) : null}
            <p className="auth-footer">
              {sent
                ? '原来的声音和草稿，会等你回来。'
                : '先听一听也可以。保存时再登录，录好的草稿会留在当前浏览器。'}
            </p>
          </section>
        </div>
      }
    </LocalizedView>
  );
}
