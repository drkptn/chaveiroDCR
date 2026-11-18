import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './App';
import { tokenStore } from './lib/api';
import { startSession } from './store/actions';
import { applyTheme } from './lib/themes';
import { DEFAULT_SETTINGS } from '@vinlancord/shared';

applyTheme({ ...DEFAULT_SETTINGS, custom: [] });

async function boot() {
  const token = await tokenStore.load();
  if (token) startSession(token);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
