'use client';
import { useRef, useState } from 'react';
import { LocalizedView, usePreferences } from './preferences';
export default function AvatarSettings({
  avatarUrl,
  nickname,
  onChanged,
}: {
  avatarUrl?: string | null;
  nickname: string;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const { t } = usePreferences();
  async function upload(file?: File) {
    if (!file) return;
    setNotice('');
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      setNotice('请选择 10 MB 以内的 PNG、JPEG 或 WebP 图片。');
      return;
    }
    setBusy(true);
    try {
      const image = await createImageBitmap(file);
      if (image.width * image.height > 36000000) {
        image.close();
        throw Error('图片过大，请换一张较小的图片。');
      }
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Error('无法处理图片，请重试。');
      const side = Math.min(image.width, image.height);
      ctx.drawImage(
        image,
        (image.width - side) / 2,
        (image.height - side) / 2,
        side,
        side,
        0,
        0,
        512,
        512,
      );
      image.close();
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(Error('无法处理图片，请重试。'))),
          'image/jpeg',
          0.9,
        ),
      );
      const form = new FormData();
      form.set('avatar', blob, 'avatar.jpg');
      const r = await fetch('/api/me/avatar', { method: 'POST', body: form });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error || '头像上传失败，请重试。');
      await onChanged();
      setNotice('头像已更新。');
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  async function remove() {
    setBusy(true);
    setNotice('');
    try {
      const r = await fetch('/api/me/avatar', { method: 'DELETE' });
      if (!r.ok) throw Error('头像上传失败，请重试。');
      await onChanged();
      setNotice('头像已移除。');
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <LocalizedView>
      <div className="avatar-settings">
        <div className="avatar-preview">
          {avatarUrl ? (
            <img src={avatarUrl} alt={t('头像')} />
          ) : (
            <span data-original>{nickname.slice(0, 1)}</span>
          )}
        </div>
        <div>
          <h3>账户头像</h3>
          <p>图片会自动居中裁切。原图最大 10 MB，保存为 512 像素头像。</p>
          <p className="small-note">头像目前仅用于你自己的账户界面。</p>
          <div className="avatar-actions">
            <button
              className="button outline small"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? '正在上传头像…' : '更换头像'}
            </button>
            {avatarUrl ? (
              <button className="text-button" disabled={busy} onClick={remove}>
                移除头像
              </button>
            ) : null}
          </div>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => void upload(e.target.files?.[0])}
          />
          {notice ? <p role="status">{notice}</p> : null}
        </div>
      </div>
    </LocalizedView>
  );
}
