'use client';
import { LocalizedView, usePreferences } from './preferences';
import { useEffect, useRef, useState } from 'react';
import type { Topic } from '@/lib/topics';
import type { ChannelMessage } from '@/lib/moderation';
import { type Voice, durationLabel } from '@/lib/shared';
import { audioMime } from '@/lib/audio-file';
import { webmDuration } from '@/lib/audio-duration';
async function api(url: string, options?: RequestInit) {
  const r = await fetch(url, options);
  const d = (await r.json()) as any;
  if (!r.ok) throw new Error(d.error ?? '暂时无法完成');
  return d;
}
export default function TopicChannel({
  topic,
  user,
  onBack,
  onLogin,
  onPlay,
  onOpen,
  playing,
  isPlaying,
}: {
  topic: Topic;
  user: { nickname: string } | null;
  onBack: () => void;
  onLogin: () => void;
  onPlay: (v: Voice) => void;
  onOpen: (v: Voice) => void;
  playing: Voice | null;
  isPlaying: boolean;
}) {
  const { t } = usePreferences();
  const [messages, setMessages] = useState<ChannelMessage[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [tab, setTab] = useState<'text' | 'voice' | 'image'>('text'),
    [body, setBody] = useState(''),
    [image, setImage] = useState<File | null>(null),
    [imageUrl, setImageUrl] = useState(''),
    [blob, setBlob] = useState<Blob | null>(null),
    [audioUrl, setAudioUrl] = useState(''),
    [duration, setDuration] = useState(0),
    [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0),
    [sending, setSending] = useState(false),
    [notice, setNotice] = useState('');
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    started = useRef(0),
    audioInput = useRef<HTMLInputElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    mounted = useRef(true);
  async function refresh(initial = false) {
    try {
      if (initial) setLoading(true);
      const d = await api(`/api/channels/${topic.id}`);
      if (mounted.current) {
        setMessages(d.messages);
        setError('');
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void refresh(true);
    const interval = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    return () => {
      mounted.current = false;
      clearInterval(interval);
      if (timer.current) clearInterval(timer.current);
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [topic.id, user?.nickname]);
  useEffect(() => {
    if (!image) {
      setImageUrl('');
      return;
    }
    const url = URL.createObjectURL(image);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  useEffect(() => {
    if (!blob) {
      setAudioUrl('');
      return;
    }
    const url = URL.createObjectURL(blob);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  function setKind(kind: 'text' | 'voice' | 'image') {
    if (recording) {
      setNotice('先结束录音，再切换类型。');
      return;
    }
    setTab(kind);
    setNotice('');
  }
  async function record() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setNotice('浏览器不支持录音，可以上传已有音频。');
      return;
    }
    try {
      document.querySelectorAll<HTMLAudioElement>('audio').forEach((a) => a.pause());
      window.speechSynthesis?.cancel();
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      stream.current = s;
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((x) =>
        MediaRecorder.isTypeSupported(x),
      );
      const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined),
        parts: BlobPart[] = [];
      recorder.current = r;
      r.ondataavailable = (e) => {
        if (e.data.size) parts.push(e.data);
      };
      r.onstop = () => {
        s.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        if (!mounted.current) return;
        setRecording(false);
        const n = Math.min(90, (Date.now() - started.current) / 1000);
        if (n < 1) {
          setNotice('至少录制一秒。');
          return;
        }
        setBlob(new Blob(parts, { type: r.mimeType }));
        setDuration(n);
      };
      r.onerror = () => {
        s.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        setRecording(false);
        setNotice('录音中断，请重试。');
      };
      r.start(250);
      started.current = Date.now();
      setSeconds(0);
      setRecording(true);
      timer.current = setInterval(() => {
        const n = Math.floor((Date.now() - started.current) / 1000);
        setSeconds(Math.min(n, 90));
        if (n >= 90 && r.state === 'recording') r.stop();
      }, 200);
    } catch {
      setNotice('无法打开麦克风，请检查权限，或上传已有录音。');
    }
  }
  async function chooseAudio(file?: File) {
    if (!file) return;
    const mime = audioMime(file.name, file.type);
    if (!mime || file.size > 10 * 1024 * 1024) {
      setNotice('请选择 10 MB 以内的音频。');
      return;
    }
    const url = URL.createObjectURL(file),
      a = new Audio(url);
    try {
      let n = await new Promise<number>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('无法读取音频')), 10000);
        a.onloadedmetadata = () => {
          clearTimeout(t);
          resolve(a.duration);
        };
        a.onerror = () => {
          clearTimeout(t);
          reject(new Error('请使用可播放的音频'));
        };
      });
      if (!Number.isFinite(n) && mime === 'audio/webm')
        n = webmDuration(new Uint8Array(await file.arrayBuffer()));
      if (!Number.isFinite(n) || n < 1 || n > 90.5) throw new Error('音频长度为 1–90 秒');
      setBlob(new Blob([file], { type: mime }));
      setDuration(n);
      setNotice('');
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      URL.revokeObjectURL(url);
      if (audioInput.current) audioInput.current.value = '';
    }
  }
  function chooseImage(file?: File) {
    if (!file) return;
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setNotice('请选择 5 MB 以内的 PNG、JPEG 或 WebP 图片。');
      return;
    }
    setImage(file);
    setNotice('');
  }
  async function send() {
    if (!user) {
      setNotice('登录后就能加入聊天，未发送内容请先保存。');
      return;
    }
    if (recording) {
      setNotice('请先结束录音。');
      return;
    }
    if (
      (tab === 'text' && !body.trim()) ||
      (tab === 'image' && !image) ||
      (tab === 'voice' && !blob)
    ) {
      setNotice('先留下一点想分享的内容吧。');
      return;
    }
    setSending(true);
    setNotice('');
    try {
      const f = new FormData();
      if (tab === 'voice') {
        f.set('audio', blob!, 'voice.webm');
        Object.entries({
          title: body.trim().slice(0, 60) || `${topic.name}的一段声音`,
          signature: user.nickname,
          recordedAt: new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date()),
          mood: topic.mood,
          topic: topic.id,
          transcript: body,
          source: '',
          visibility: 'public',
          duration: String(duration),
          futureYear: topic.id === 'future' ? String(new Date().getFullYear() + 10) : '',
          parentId: '',
        }).forEach(([k, v]) => f.set(k, v));
        await api('/api/voices', { method: 'POST', body: f });
      } else {
        f.set('kind', tab);
        f.set('body', body);
        if (image && tab === 'image') f.set('image', image);
        await api(`/api/channels/${topic.id}`, { method: 'POST', body: f });
      }
      setBody('');
      setImage(null);
      setBlob(null);
      setDuration(0);
      setNotice('已发送，审核后对频道公开。你现在可以看到自己的待审核消息。');
      await refresh();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  async function report(m: ChannelMessage) {
    if (!user) {
      setNotice('登录后可举报。');
      return;
    }
    const reason = window.prompt(t('请说明这条消息有什么问题（最多 300 字）'));
    if (!reason) return;
    try {
      await api(m.kind === 'voice' ? `/api/voices/${m.id}` : `/api/messages/${m.id}`, {
        method: m.kind === 'voice' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'report', reason }),
      });
      setNotice('举报已收到，审核员会处理。');
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  async function remove(m: ChannelMessage) {
    if (!window.confirm(t('确定删除自己的这条消息？删除后无法恢复。'))) return;
    try {
      await api(m.kind === 'voice' ? `/api/voices/${m.id}` : `/api/messages/${m.id}`, {
        method: 'DELETE',
      });
      await refresh();
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  return (
    <LocalizedView>
      {
        <section className="page-section channel-page">
          <button className="text-button" onClick={onBack}>
            ← 回到声音墙
          </button>
          <div className={`channel-heading theme-${topic.color}`}>
            <span className="topic-label">{topic.label} · 公共频道</span>
            <h1>{topic.name}</h1>
            <h2>{topic.question}</h2>
            <p>{topic.description}</p>
            <div className="channel-media-types">
              <span>◌ 语音</span>
              <span>✎ 文字</span>
              <span>▧ 图片</span>
              <span>审核后公开 · 每 15 秒更新</span>
            </div>
          </div>
          <div className="channel-layout">
            <div className="channel-main">
              <div className="channel-stream" aria-label="频道消息">
                <div className="channel-stream-title">
                  <h2>在这里，说两句</h2>
                  <button className="text-button" onClick={() => refresh(true)}>
                    刷新频道 ↻
                  </button>
                </div>
                <div className="channel-welcome">
                  欢迎来到「{topic.name}」。可以轻松交流，也请尊重正在屏幕另一端的每个人。
                </div>
                {error ? (
                  <p className="channel-error" role="alert">
                    {error}
                  </p>
                ) : null}
                {loading ? (
                  <p className="loading">正在打开频道…</p>
                ) : messages.length ? (
                  messages.map((m) => (
                    <article className={`chat-message ${m.mine ? 'my-message' : ''}`} key={m.id}>
                      <span className="chat-avatar">{m.signature.slice(0, 1)}</span>
                      <div className="chat-message-content">
                        <div className="chat-byline">
                          <strong>
                            <span data-original className="original-text">
                              {m.signature}
                            </span>
                          </strong>
                          <time>
                            {new Date(m.createdAt).toLocaleString('zh-CN', {
                              timeZone: 'Asia/Shanghai',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                          {m.status !== 'approved' ? (
                            <span className={`status status-${m.status}`}>
                              {m.status === 'pending' ? '仅你可见 · 待审核' : '审核退回'}
                            </span>
                          ) : null}
                        </div>
                        <div className={`chat-bubble chat-${m.kind}`}>
                          {m.kind === 'voice' && m.voice ? (
                            <>
                              <button
                                className="chat-voice-play"
                                aria-label={`播放${m.voice.title}`}
                                onClick={() => onPlay(m.voice!)}
                              >
                                <span>{playing?.id === m.id && isPlaying ? 'Ⅱ' : '▶'}</span>
                                <span className="mini-wave">▂▅▃▆▂▅▃▆▅▂▅▃</span>
                                <span>{durationLabel(m.voice.duration)}</span>
                              </button>
                              <button className="text-button" onClick={() => onOpen(m.voice!)}>
                                声音档案 · 查看署名与日期 →
                              </button>
                            </>
                          ) : null}
                          {m.kind === 'image' ? (
                            <a href={m.mediaUrl} target="_blank" rel="noreferrer">
                              <img
                                src={m.mediaUrl}
                                alt={m.body || `${m.signature}分享的图片`}
                                loading="lazy"
                              />
                            </a>
                          ) : null}
                          {m.body ? (
                            <p>
                              <span data-original className="original-text">
                                {m.body}
                              </span>
                            </p>
                          ) : null}
                        </div>
                        {m.reviewNote ? (
                          <p className="review-note">
                            审核说明：
                            <span data-original className="original-text">
                              {m.reviewNote}
                            </span>
                          </p>
                        ) : null}
                        <div className="chat-message-actions">
                          {m.mine ? (
                            <button onClick={() => remove(m)}>删除自己的消息</button>
                          ) : m.status === 'approved' ? (
                            <button onClick={() => report(m)}>举报</button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="channel-empty">
                    <span>◌</span>
                    <h3>第一句话，留给你。</h3>
                    <p>
                      {topic.id === 'casual'
                        ? '“我今天吃到了好好吃的东西。” 就从这种小事开始。'
                        : '这个频道还没有公开留言。先留下你的声音、文字或照片吧。'}
                    </p>
                  </div>
                )}
              </div>
              <div className="channel-composer">
                <div className="composer-tabs" role="tablist" aria-label="消息类型">
                  {(['text', 'voice', 'image'] as const).map((t, i) => (
                    <button
                      key={t}
                      role="tab"
                      aria-selected={tab === t}
                      className={tab === t ? 'selected' : ''}
                      onClick={() => setKind(t)}
                    >
                      {['✎ 文字', '◌ 语音', '▧ 图片'][i]}
                    </button>
                  ))}
                </div>
                {tab === 'voice' ? (
                  <div className="channel-recorder">
                    <span className={recording ? 'record-dot' : ''} />
                    <span>{durationLabel(recording ? seconds : duration)}</span>
                    <button
                      className="button outline small"
                      onClick={() => (recording ? recorder.current?.stop() : record())}
                    >
                      {recording ? '结束录音' : blob ? '重新录音' : '录一段声音'}
                    </button>
                    <button
                      className="text-button"
                      disabled={recording}
                      onClick={() => audioInput.current?.click()}
                    >
                      上传音频
                    </button>
                    {audioUrl && !recording ? (
                      <audio
                        controls
                        src={audioUrl}
                        onPlay={() => {
                          document.querySelectorAll<HTMLAudioElement>('audio').forEach((a) => {
                            if (a.src !== audioUrl) a.pause();
                          });
                        }}
                      />
                    ) : null}
                    <input
                      hidden
                      type="file"
                      ref={audioInput}
                      accept="audio/*,.webm,.m4a,.wav,.mp3"
                      onChange={(e) => chooseAudio(e.target.files?.[0])}
                    />
                  </div>
                ) : null}
                {tab === 'image' ? (
                  <div className="channel-image-input">
                    {imageUrl ? (
                      <>
                        <img src={imageUrl} alt="待发送图片预览" />
                        <button className="text-button" onClick={() => setImage(null)}>
                          移除图片
                        </button>
                      </>
                    ) : (
                      <button className="image-drop" onClick={() => imageInput.current?.click()}>
                        ▧ 选择一张想分享的照片 <small>PNG / JPEG / WebP · 最多 5 MB</small>
                      </button>
                    )}
                    <input
                      hidden
                      type="file"
                      ref={imageInput}
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => chooseImage(e.target.files?.[0])}
                    />
                  </div>
                ) : null}
                <textarea
                  aria-label="频道消息"
                  maxLength={1000}
                  rows={3}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={
                    tab === 'text'
                      ? topic.id === 'casual'
                        ? '想说什么就说两句，轻松一点。'
                        : '从这个话题开始，写下你想分享的事。'
                      : tab === 'voice'
                        ? '给声音加一句文字（可选）'
                        : '给图片写一句说明（可选）'
                  }
                />
                <div className="composer-bottom">
                  <span>保持友善，不攻击、不引战。{body.length}/1000</span>
                  {user ? (
                    <button
                      className="button primary small"
                      disabled={sending || recording}
                      onClick={send}
                    >
                      {sending ? '正在发送…' : '发送到频道 →'}
                    </button>
                  ) : (
                    <button className="button primary small" onClick={onLogin}>
                      登录后加入聊天
                    </button>
                  )}
                </div>
                <p className="small-note">
                  语音、文字与图片均先审核再公开。频道输入不会自动保存，请在离开前保留草稿。
                </p>
                {notice ? (
                  <p className="channel-notice" role="status">
                    {notice}
                  </p>
                ) : null}
              </div>
            </div>
            <aside className="channel-sidebar">
              <section>
                <h3>{topic.id === 'casual' ? '随便聊，不必有结论' : '不知道说什么？'}</h3>
                <p>{topic.prompt}</p>
              </section>
              <section>
                <h3>这个频道的约定</h3>
                <ul>
                  <li>可以累，可以遇到困难，也可以求鼓励。</li>
                  <li>不辱骂、不嘲讽、不制造对立。</li>
                  <li>不发布消极诱导、广告或他人的隐私。</li>
                  <li>图片与语音由审核员检查后公开。</li>
                </ul>
              </section>
              {topic.id === 'infp' ? (
                <section>
                  <h3>把它当成轻松的小实验</h3>
                  <p>人格标签只是聊天的起点，声音没有统一模板，也不能判断一个人的人格。</p>
                </section>
              ) : null}
            </aside>
          </div>
        </section>
      }
    </LocalizedView>
  );
}
