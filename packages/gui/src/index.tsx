/* @refresh reload */
import { render } from 'solid-js/web';
import './index.css';
import App from './App';

// Dev-only: opt-in cache busting via ?nocache=1 (does not touch queue)
if (import.meta.env.DEV) {
  const params = new URLSearchParams(window.location.search);
  if (params.has('nocache') || params.has('clearCaches')) {
    // Unregister any service workers
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((reg) => reg.unregister().catch(() => {}));
        });
      }
    } catch {}

    // Clear CacheStorage
    try {
      if ('caches' in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      }
    } catch {}
  }
}

const root = document.getElementById('app');

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?',
  );
}

render(() => <App />, root!);
