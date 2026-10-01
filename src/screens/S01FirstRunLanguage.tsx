import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LanguagePicker } from '../components';
import { flowSession } from '../flow/session';
import { t } from '../i18n';
import type { Language } from '../i18n/languages';
import { firstRunRedirect } from './routing';
import { ScreenFrame } from './ScreenFrame';

// S01 First run / language (01-first-run-language.md). Whole row selects; primary carries the
// pick into the flow session (content language for the library, C-09 `contentLanguage`).
export default function S01FirstRunLanguage() {
  const nav = useNavigate();
  const [pick, setPick] = useState<Language | undefined>();
  // A language is already chosen: reopening at `/` starts on the Library, not the picker again.
  const { search } = useLocation();
  const skipTo = firstRunRedirect(flowSession().get().language, search);
  if (skipTo) return <Navigate to={skipTo} replace />;
  return (
    <ScreenFrame
      id="S01"
      primaryLabel={
        pick ? t('s.lang.primary-pick', { language: pick.autonym }) : t('s.lang.primary-idle')
      }
      primaryState={pick ? 'default' : 'disabled'}
      onPrimary={() => {
        if (!pick) return;
        flowSession().setLanguage(pick.code);
        nav('/library');
      }}
    >
      <LanguagePicker variant="first-run" value={pick?.code} onChange={(_c, row) => setPick(row)} />
      <p className="fia-caption">{t('s.lang.disclosure')}</p>
    </ScreenFrame>
  );
}
