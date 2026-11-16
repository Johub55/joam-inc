import React, { useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';

const reloadFresh = async () => {
  try {
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
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
  const [initialBuildTime, setInitialBuildTime] = useState<number | null>(null);
  const [newVersionDetected, setNewVersionDetected] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(4);

  const getVersionUrl = () => {
    return `./version.json?t=${Date.now()}`;
  };

  // Fetch initial version on mount
  useEffect(() => {
    let isMounted = true;
    const fetchInitialVersion = async () => {
      try {
        const res = await fetch(getVersionUrl(), { cache: 'no-store' });
        if (res.ok && res.status === 200) {
          const data = await res.json().catch(() => null);
          if (isMounted && data && data.buildTime) {
            setInitialBuildTime(data.buildTime);
          }
        }
      } catch {
        // Silently ignore 404 / network error for dev environment
      }
    };

    fetchInitialVersion();
    return () => { isMounted = false; };
  }, []);

  // Poll version every 20 seconds and immediately on tab focus / visibility restore
  useEffect(() => {
    if (!initialBuildTime) return;

    const checkVersion = async () => {
      try {
        const res = await fetch(getVersionUrl(), { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.buildTime && data.buildTime > initialBuildTime + 2000) {
            setNewVersionDetected(true);
          }
        }
      } catch {
        // Ignore periodic network errors
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkVersion();
      }
    };

    const interval = setInterval(checkVersion, 20000);
    window.addEventListener('focus', checkVersion);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkVersion);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [initialBuildTime]);

  // Handle countdown and auto-reload when new version is detected
  useEffect(() => {
    if (!newVersionDetected) return;

    if (countdown <= 0) {
      void reloadFresh();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [newVersionDetected, countdown]);

  if (!newVersionDetected) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-amber-500 via-emerald-500 to-cyan-500 text-slate-950 px-4 py-2.5 shadow-2xl flex items-center justify-between gap-3 animate-in slide-in-from-top duration-300">
      <div className="flex items-center gap-2 text-xs font-black sm:text-sm">
        <Sparkles className="w-4 h-4 text-slate-950 animate-spin" />
        <span>🚀 Nieuwe versie geüpload op GitHub! De pagina wordt over <strong>{countdown} seconden</strong> automatisch vernieuwd...</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { void reloadFresh(); }}
          className="px-3 py-1 bg-slate-950 hover:bg-slate-900 text-white font-black text-xs rounded-lg transition shadow-md flex items-center gap-1 active:scale-95"
        >
          <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
          <span>Nu Herladen!</span>
        </button>
      </div>
    </div>
  );
};
