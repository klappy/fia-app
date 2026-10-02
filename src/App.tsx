import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SCREENS, SCREEN_COMPONENTS } from './screens';
import { browserStore, loadSettings } from './settings';

// BEGET (kit gap): BT Glass goes dark only under [data-theme="dark"] (kit tokens/theme-dark.css:6),
// while the app's "follow the phone" setting removes data-theme (settings/apply.ts:15). Mirror the
// phone's scheme onto <html> whenever no explicit theme is set, and track changes.
function useKitTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      if (loadSettings(browserStore()).settings.theme !== 'system') return;
      const want = mq.matches ? 'dark' : 'light';
      if (root.getAttribute('data-theme') !== want) root.setAttribute('data-theme', want);
    };
    const watch = new MutationObserver(() => {
      if (!root.hasAttribute('data-theme')) sync();
    });
    sync();
    mq.addEventListener('change', sync);
    watch.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener('change', sync);
      watch.disconnect();
    };
  }, []);
}

export function App() {
  useKitTheme();
  return (
    <BrowserRouter>
      <Routes>
        {SCREENS.map((s) => {
          const C = SCREEN_COMPONENTS[s.id];
          return <Route key={s.id} path={s.path} element={<C />} />;
        })}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
