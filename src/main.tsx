import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker in production for offline asset caching and instant loading
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  try {
    registerSW({ immediate: true });
  } catch (swErr) {
    console.warn('PWA registration notice:', swErr);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);



