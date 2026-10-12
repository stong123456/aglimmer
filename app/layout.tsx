import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '一点光 · A Glimmer',
  description:
    '每个声音里，都有一点光。A little light, in every voice. 用声音给陌生人一点力量，也留住此刻的自己。',
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
