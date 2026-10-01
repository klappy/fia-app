import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyToDocument, browserStore, loadSettings } from './settings';
import { registerOffline } from './offline/register';
import './tokens/alpha.css';
import './app.css';

// Saved C-10 display settings (theme, text size, Easy mode) apply from the first paint on every
// screen, not only while S14 is open; S14 keeps its own effect for live changes.
applyToDocument(loadSettings(browserStore()).settings);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerOffline();
