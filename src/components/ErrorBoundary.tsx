import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const isChunkLoadError = (error: Error | null): boolean => {
  if (!error) return false;
  const msg = String(error.message || error.name || '').toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('loading chunk') ||
    msg.includes('chunkloaderror')
  );
};

const forceCacheBustedReload = async () => {
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

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);

    // Eenmalig automatisch herstellen als GitHub Pages een nieuwere versie heeft gedeployed
    if (isChunkLoadError(error)) {
      try {
        const key = 'wd_chunk_reload_at';
        const last = Number(sessionStorage.getItem(key) || '0');
        const now = Date.now();
        if (now - last > 15000) {
          sessionStorage.setItem(key, String(now));
          void forceCacheBustedReload();
        }
      } catch {}
    }
  }

  private handleReset = async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    await forceCacheBustedReload();
  };

  private handleReload = async () => {
    await forceCacheBustedReload();
  };

  public render(): ReactNode {
    const instance = this as any;
    if (instance.state?.hasError) {
      const chunkErr = isChunkLoadError(instance.state?.error || null);
      return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center select-none font-sans">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 flex items-center justify-center mx-auto text-3xl font-bold">
              ⚠️
            </div>
            <div>
              <h2 className="text-xl font-black text-white">
                {chunkErr ? 'Nieuwe versie beschikbaar' : 'Oeps! Er is iets misgegaan'}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {chunkErr
                  ? 'Er is waarschijnlijk een nieuwe update op GitHub Pages geplaatst. Herlaad de pagina om de nieuwste versie op te halen.'
                  : 'De applicatie heeft een onverwachte fout opgevangen om een wit scherm te voorkomen.'}
              </p>
            </div>

            {instance.state?.error && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-left font-mono text-[10px] text-red-300 overflow-x-auto max-h-32">
                {instance.state.error.message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 py-2 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs transition active:scale-95"
              >
                Pagina Herladen
              </button>
              <button
                onClick={this.handleReset}
                className="flex-1 py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition active:scale-95"
              >
                Reset App Data
              </button>
            </div>
          </div>
        </div>
      );
    }

    return instance.props?.children;
  }
}
