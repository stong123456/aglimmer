'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { translateView } from '@/lib/i18n-view.ts';
import { Palette } from 'lucide-react';
import { translate, type Locale } from '@/lib/i18n';
export type Theme = 'warm' | 'night' | 'pink';
export const themeImages: Record<Theme, string> = {
  warm: '/images/landscape.png',
  night: '/images/theme-night.png',
  pink: '/images/theme-pink.png',
};
const Context = createContext<{
  theme: Theme;
  locale: Locale;
  setTheme: (v: Theme) => void;
  setLocale: (v: Locale) => void;
  t: (s: string) => string;
} | null>(null);
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('warm'),
    [locale, setLocale] = useState<Locale>('zh'),
    [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem('aglimmer-preferences') || '{}');
      if (['warm', 'night', 'pink'].includes(v.theme)) setTheme(v.theme);
      if (['zh', 'en'].includes(v.locale)) setLocale(v.locale);
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
    document.title = locale === 'en' ? 'A Glimmer · Voices and time' : '一点光 · A Glimmer';
    try {
      localStorage.setItem('aglimmer-preferences', JSON.stringify({ theme, locale }));
    } catch {}
  }, [theme, locale, ready]);
  return (
    <Context.Provider
      value={{ theme, locale, setTheme, setLocale, t: (s) => translate(s, locale) }}
    >
      {children}
    </Context.Provider>
  );
}
export function usePreferences() {
  const c = useContext(Context);
  if (!c) throw Error('PreferencesProvider missing');
  return c;
}
// Translate the React view before rendering. Never alter the DOM or input values.
// Author-supplied recordings/messages are marked data-original and kept verbatim.
export function LocalizedView({ children }: { children: ReactNode }) {
  const { locale } = usePreferences();
  return <>{translateView(children, locale)}</>;
}
export function PreferencesMenu() {
  const { theme, locale, setTheme, setLocale, t } = usePreferences();
  return (
    <details className="preferences-menu">
      <summary>
        <Palette size={18} />
        <span>{t('外观与语言')}</span>
      </summary>
      <div className="preferences-panel">
        <label>
          {t('界面风格')}
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
            aria-label={t('界面风格')}
          >
            <option value="warm">{t('暖纸质')}</option>
            <option value="night">{t('深蓝夜间')}</option>
            <option value="pink">{t('桃粉杂志')}</option>
          </select>
        </label>
        <label>
          {t('界面语言')}
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            aria-label={t('界面语言')}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
        <small>{t('选择会保存在此浏览器。投稿保留原文。')}</small>
      </div>
    </details>
  );
}
