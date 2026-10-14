'use client';
import { useEffect, useRef, useState } from 'react';
import { X, Download } from 'lucide-react';
import { type Voice, dateLabel } from '@/lib/shared';
import { download } from '@/lib/zip';
import { canMakePostcard, postcardQuote } from '@/lib/postcard';
import { LocalizedView, usePreferences, themeImages } from './preferences';
export default function VoicePostcard({ voice, onClose }: { voice: Voice; onClose: () => void }) {
  const { theme, locale, t } = usePreferences();
  const [quote, setQuote] = useState(() => postcardQuote(voice.title, voice.transcript)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null),
    modal = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const local =
    typeof location !== 'undefined' && ['127.0.0.1', 'localhost'].includes(location.hostname);
  useEffect(() => {
    const focus = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modal.current?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const controls = modal.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),textarea',
        );
        if (controls?.length) {
          const first = controls[0],
            last = controls[controls.length - 1];
          if (
            e.shiftKey &&
            (document.activeElement === first || document.activeElement === modal.current)
          ) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }
    window.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', key);
      focus?.focus();
    };
  }, []);
  useEffect(() => {
    let active = true;
    setReady(false);
    setError('');
    async function draw() {
      const element = canvas.current;
      if (!element) return;
      const ctx = element.getContext('2d');
      if (!ctx) return;
      const image = new Image();
      image.src = themeImages[theme];
      await image.decode();
      await document.fonts.ready;
      const QRCode = (await import('qrcode')).default;
      const qr = await QRCode.toDataURL(
        location.origin + '/?voice=' + encodeURIComponent(voice.id),
        { width: 200, margin: 1, errorCorrectionLevel: 'M' },
      );
      const qrImage = new Image();
      qrImage.src = qr;
      await qrImage.decode();
      if (!active) return;
      const colors =
        theme === 'night'
          ? { paper: '#0b1528', ink: '#f2eee5', muted: '#afbdd1', accent: '#f5c786' }
          : theme === 'pink'
            ? { paper: '#fff0f1', ink: '#672e48', muted: '#865c71', accent: '#df6066' }
            : { paper: '#f7f5ef', ink: '#273e35', muted: '#737c75', accent: '#b3834d' };
      element.width = 1200;
      element.height = 800;
      ctx.fillStyle = colors.paper;
      ctx.fillRect(0, 0, 1200, 800);
      ctx.drawImage(
        image,
        0,
        image.height * 0.27,
        image.width,
        image.height * 0.5,
        0,
        470,
        1200,
        330,
      );
      ctx.fillStyle = colors.accent;
      ctx.font = '22px sans-serif';
      ctx.fillText('A GLIMMER · ' + (locale === 'en' ? 'VOICE POSTCARD' : '声音明信片'), 70, 65);
      ctx.fillStyle = colors.ink;
      const cardText = quote.replace(/\s+/gu, ' ').trim();
      let fontSize = 44;
      const measureLines = () => {
        let count = 1,
          line = '';
        for (const c of cardText) {
          if (c === '\n' || ctx.measureText(line + c).width > 870) {
            count++;
            line = '';
            if (c === '\n') continue;
          }
          line += c;
        }
        return count;
      };
      ctx.font = fontSize + 'px "Noto Serif SC", serif';
      while (fontSize > 20 && measureLines() > 3) {
        fontSize -= 2;
        ctx.font = fontSize + 'px "Noto Serif SC", serif';
      }
      let line = '',
        y = 160;
      for (const character of cardText) {
        if (character === '\n' || ctx.measureText(line + character).width > 870) {
          ctx.fillText(line, 70, y);
          line = '';
          y += Math.round(fontSize * 1.45);
          if (character === '\n') continue;
        }
        line += character;
      }
      if (line) ctx.fillText(line, 70, y);
      ctx.font = '26px sans-serif';
      ctx.fillText(voice.signature, 70, 340);
      ctx.fillStyle = colors.muted;
      ctx.font = '22px sans-serif';
      ctx.fillText(dateLabel(voice.recordedAt), 70, 382);
      ctx.fillText(voice.demo ? t('AI 示例朗读') : t('公开声音'), 70, 425);
      ctx.fillStyle = '#fff';
      ctx.fillRect(980, 290, 165, 165);
      ctx.drawImage(qrImage, 988, 298, 149, 149);
      ctx.fillStyle = colors.muted;
      ctx.font = '15px sans-serif';
      ctx.fillText(locale === 'en' ? 'SCAN TO LISTEN' : '扫码听见这段声音', 990, 476);
      setReady(true);
    }
    void draw().catch(() => {
      if (active) setError('明信片下载失败，请重试。');
    });
    return () => {
      active = false;
    };
  }, [theme, locale, quote, voice.id, voice.signature, voice.recordedAt, voice.demo]);
  async function save() {
    if (!canMakePostcard(voice)) return;
    setBusy(true);
    setError('');
    try {
      if (!voice.demo) {
        const r = await fetch('/api/voices/' + encodeURIComponent(voice.id));
        const d = (await r.json()) as { voice?: Voice };
        if (!r.ok || !d.voice || !canMakePostcard(d.voice))
          throw Error('这段声音现在不可公开分享。');
      }
      const png = await new Promise<Blob>((resolve, reject) =>
        canvas.current?.toBlob(
          (b) => (b ? resolve(b) : reject(Error('明信片下载失败，请重试。'))),
          'image/png',
        ),
      );
      download(png, 'A-Glimmer-' + voice.recordedAt + '-postcard.png');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <LocalizedView>
      <div
        className="modal-backdrop"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <section
          className="voice-modal postcard-modal"
          role="dialog"
          aria-modal="true"
          aria-label="明信片预览"
          ref={modal}
          tabIndex={-1}
        >
          <button className="modal-close icon-button" aria-label="关闭明信片" onClick={onClose}>
            <X size={20} />
          </button>
          <h2>声音明信片</h2>
          <p className="small-note">分享卡包含录音链接。撤回公开声音后，该链接将停止播放。</p>
          <label className="postcard-quote">
            选择一句想留下的话
            <textarea
              maxLength={90}
              rows={2}
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
            />
          </label>
          <canvas ref={canvas} aria-label={t('明信片预览')} className="postcard-canvas" />
          {voice.demo || local ? (
            <p className="small-note">
              这是本地或示例明信片。二维码使用当前网址，不代表网站已经上线。
            </p>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
          <button
            className="button primary"
            disabled={!ready || busy || !quote.trim()}
            onClick={() => void save()}
          >
            <Download size={18} />
            下载明信片
          </button>
        </section>
      </div>
    </LocalizedView>
  );
}
