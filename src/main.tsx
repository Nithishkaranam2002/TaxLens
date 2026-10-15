import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { store } from './app/store';
import './styles.css';
import { App } from './ui/App';

void store.init();
// End-to-end tests read the store when the page is opened with ?e2e.
try { if (new URLSearchParams(location.search).has('e2e')) (window as unknown as { taxlens: typeof store }).taxlens = store; } catch { /* ignore */ }
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
