import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Verwijder tijdelijke cache-bust parameter (_r) na een automatische herlaadactie
try {
  const url = new URL(window.location.href);
  if (url.searchParams.has('_r')) {
    url.searchParams.delete('_r');
    const cleanUrl = url.pathname + (url.search ? url.search : '') + url.hash;
    window.history.replaceState(null, '', cleanUrl);
  }
} catch {}

// Automatisch herladen bij verouderde Vite module-chunks (bijv. na GitHub Pages update)
const triggerChunkRecoveryReload = () => {
  try {
    const key = 'wd_chunk_reload_at';
    const last = Number(sessionStorage.getItem(key) || '0');
    const now = Date.now();
    if (now - last < 15000) return;
    sessionStorage.setItem(key, String(now));
    if ('caches' in window) {
      caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))).catch(() => {});
    }
    const url = new URL(window.location.href);
    url.searchParams.set('_r', String(now));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
};

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  triggerChunkRecoveryReload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
