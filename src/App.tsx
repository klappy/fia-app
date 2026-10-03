import { useLayoutEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SCREENS, SCREEN_COMPONENTS } from './screens';

// BEGET (kit gap): BT Glass goes dark only under [data-theme="dark"] (kit tokens/theme-dark.css:6),
// while the app's "follow the phone" setting removes data-theme (settings/apply.ts:15). Mirror the
// phone's scheme onto <html> whenever no explicit theme is set, and track changes.
function useKitTheme() {
  // Layout effect: mirror the theme before first paint so a dark phone never flashes light.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    // "Follow the phone" is signalled by applyToDocument removing data-theme (settings/apply.ts:18),
    // not by the stored setting: a failed save of "system" still removes the attribute but keeps the
    // old theme in storage, which used to leave data-theme unset (PR #22 deferred line).
    let following = !root.hasAttribute('data-theme');
    let ours = 0; // mutation records caused by our own setAttribute calls, to skip in the observer
    const sync = () => {
      if (!following) return;
      const want = mq.matches ? 'dark' : 'light';
      if (root.getAttribute('data-theme') !== want) {
        ours++;
        root.setAttribute('data-theme', want);
      }
    };
    const watch = new MutationObserver((records) => {
      for (let i = 0; i < records.length; i++) {
        if (ours > 0) ours--;
        else following = !root.hasAttribute('data-theme');
      }
      sync();
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
