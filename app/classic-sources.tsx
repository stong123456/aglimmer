'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { OfficialSource } from '@/lib/official-sources';
import type { ClassicQuote } from '@/lib/quotes';
type Health = { id: string; status: string; checked_at: string };
type Sources = {
  health: Health[];
  catalog: ClassicQuote[] | null;
  officialSources: OfficialSource[];
  hidden: string[] | null;
  error: boolean;
  reload: () => void;
};
const Context = createContext<Sources | null>(null);
export function ClassicSourcesProvider({ children }: { children: ReactNode }) {
  const loaded = useRef(false);
  const previousHidden = useRef<string[]>([]);
  const [officialSources, setOfficialSources] = useState<OfficialSource[]>([]);
  const [health, setHealth] = useState<Health[]>([]);
  const [catalog, setCatalog] = useState<ClassicQuote[] | null>(null);
  const [hidden, setHidden] = useState<string[] | null>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      try {
        const r = await fetch('/api/classics' + (loaded.current ? '' : '?catalog=1'), {
          signal: controller.signal,
        });
        if (!r.ok) throw Error();
        let d = (await r.json()) as {
          hidden: string[];
          items?: ClassicQuote[];
          officialSources?: OfficialSource[];
          health?: Health[];
        };
        if (loaded.current && previousHidden.current.some((id) => !d.hidden?.includes(id))) {
          const full = await fetch('/api/classics?catalog=1', { signal: controller.signal });
          if (!full.ok) throw Error();
          d = (await full.json()) as typeof d;
          loaded.current = false;
        }
        if (!Array.isArray(d.hidden)) throw Error();
        if (!loaded.current) {
          if (!Array.isArray(d.items)) throw Error();
          setCatalog(d.items);
          setOfficialSources(d.officialSources ?? []);
          loaded.current = true;
        }
        if (Array.isArray(d.health)) setHealth(d.health);
        previousHidden.current = d.hidden;
        const normalized = [...d.hidden].sort();
        setHidden((previous) =>
          previous?.length === normalized.length && previous.every((id, i) => id === normalized[i])
            ? previous
            : normalized,
        );
        setError(false);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError(true);
      } finally {
        loading = false;
      }
    }
    void load();
    const refresh = () => {
      if (!document.hidden) void load();
    };
    const interval = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => {
      controller.abort();
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [retry]);
  return (
    <Context.Provider
      value={{
        hidden,
        health,
        catalog,
        officialSources,
        error,
        reload: () => {
          loaded.current = false;
          setError(false);
          setRetry((n) => n + 1);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useClassicSources() {
  const value = useContext(Context);
  if (!value) throw Error('Classic source provider is missing');
  return value;
}
