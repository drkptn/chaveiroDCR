import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './App';
import { tokenStore } from './lib/api';
import { startSession } from './store/actions';
import { applyAppearance } from './lib/themes';
import { useAppearance } from './store/appearance';

// aplica a última aparência usada antes de qualquer coisa (sem "piscar" o tema padrão)
applyAppearance(useAppearance.getState().current);

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
