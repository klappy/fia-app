import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SCREENS, SCREEN_COMPONENTS } from './screens';

export function App() {
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
