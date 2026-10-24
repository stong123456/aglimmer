import type { Metadata } from 'next';
import './globals.css';
import { ListeningProvider } from './listening-player';
import { ClassicSourcesProvider } from './classic-sources';
import { PreferencesProvider } from './preferences';
export const metadata: Metadata = {
  title: '一点光 · A Glimmer',
  description:
    '每个声音里，都有一点光。A little light, in every voice. 用声音给陌生人一点力量，也留住此刻的自己。',
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-theme="night" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var p=JSON.parse(localStorage.getItem('aglimmer-preferences')||'{}');if(['warm','night','pink'].includes(p.theme))document.documentElement.dataset.theme=p.theme;}catch(e){}`,
          }}
        />
        <PreferencesProvider>
          <ClassicSourcesProvider>
            <ListeningProvider>{children}</ListeningProvider>
          </ClassicSourcesProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
