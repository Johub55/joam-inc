import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';

const BUILD_VERSION =
  typeof __APP_BUILD_VERSION__ !== 'undefined' ? __APP_BUILD_VERSION__ : 'dev';

const RELOAD_GUARD_VERSION_KEY = 'wd_reloaded_version';
const RELOAD_GUARD_TIME_KEY = 'wd_reloaded_at';

const getVersionUrl = () => {
  try {
    const base = new URL('./', window.location.href);
    const target = new URL('version.json', base);
    target.searchParams.set('t', String(Date.now()));
    return target.toString();
  } catch {
    return `./version.json?t=${Date.now()}`;
  }
};

const reloadFresh = async (targetVersion?: string | null) => {
  try {
    if (targetVersion) {
      sessionStorage.setItem(RELOAD_GUARD_VERSION_KEY, targetVersion);
      sessionStorage.setItem(RELOAD_GUARD_TIME_KEY, String(Date.now()));
    }
  } catch {}
  try {
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
  } catch {}
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {}
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_r', String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
};

export const AutoUpdateBanner: React.FC = () => {
  const [devBaselineTime, setDevBaselineTime] = useState<number | null>(null);
  const [detectedVersion, setDetectedVersion] = useState<string | null>(null);
  const [newVersionDetected, setNewVersionDetected] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(4);
  const reloadingRef = useRef<boolean>(false);

  const isProdBuild = BUILD_VERSION !== 'dev';

  const triggerUpdateBanner = useCallback((nextVersion: string) => {
    try {
      const lastVer = sessionStorage.getItem(RELOAD_GUARD_VERSION_KEY);
      const lastAt = Number(sessionStorage.getItem(RELOAD_GUARD_TIME_KEY) || '0');
      if (lastVer === nextVersion && Date.now() - lastAt < 30000) {
        return;
      }
    } catch {}
    setDetectedVersion(nextVersion);
    setNewVersionDetected(true);
  }, []);

  // In dev mode (AI Studio live server), capture initial public/version.json buildTime
  useEffect(() => {
    if (isProdBuild) return;
    let isMounted = true;
    const fetchInitialVersion = async () => {
      try {
        const res = await fetch(getVersionUrl(), { cache: 'no-store' });
        if (res.ok && res.status === 200) {
          const data = await res.json().catch(() => null);
          if (isMounted && data && typeof data.buildTime === 'number') {
            setDevBaselineTime(data.buildTime);
          }
        }
      } catch {
        // Silently ignore 404 / network error in dev environment
      }
    };

    void fetchInitialVersion();
    return () => {
      isMounted = false;
    };
  }, [isProdBuild]);

  // Poll version.json every 20 seconds and immediately on mount (prod), tab focus, or visibility restore
  useEffect(() => {
    if (!isProdBuild && !devBaselineTime) return;

    const checkVersion = async () => {
      try {
        const res = await fetch(getVersionUrl(), {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!data || typeof data.buildTime !== 'number') return;

        if (isProdBuild) {
          if (typeof data.version === 'string' && data.version !== BUILD_VERSION) {
            triggerUpdateBanner(data.version);
          }
        } else if (devBaselineTime && data.buildTime > devBaselineTime + 2000) {
          triggerUpdateBanner(String(data.version || data.buildTime));
        }
      } catch {
        // Ignore periodic network errors
      }
    };

    if (isProdBuild) {
      void checkVersion();
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkVersion();
      }
    };

    const interval = setInterval(() => {
      void checkVersion();
    }, 20000);
    window.addEventListener('focus', checkVersion);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkVersion);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isProdBuild, devBaselineTime, triggerUpdateBanner]);

  // Handle countdown and auto-reload when new version is detected
  useEffect(() => {
    if (!newVersionDetected) return;

    if (countdown <= 0) {
      if (!reloadingRef.current) {
        reloadingRef.current = true;
        void reloadFresh(detectedVersion);
      }
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [newVersionDetected, countdown, detectedVersion]);

  if (!newVersionDetected) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-amber-500 via-emerald-500 to-cyan-500 text-slate-950 px-4 py-2.5 shadow-2xl flex items-center justify-between gap-3 animate-in slide-in-from-top duration-300">
      <div className="flex items-center gap-2 text-xs font-black sm:text-sm">
        <Sparkles className="w-4 h-4 text-slate-950 animate-spin" />
        <span>
          🚀 Nieuwe versie beschikbaar! De pagina wordt over <strong>{countdown} seconden</strong> automatisch vernieuwd...
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (!reloadingRef.current) {
              reloadingRef.current = true;
              void reloadFresh(detectedVersion);
            }
          }}
          className="px-3 py-1 bg-slate-950 hover:bg-slate-900 text-white font-black text-xs rounded-lg transition shadow-md flex items-center gap-1 active:scale-95"
        >
          <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
          <span>Nu Herladen!</span>
        </button>
      </div>
    </div>
  );
};
