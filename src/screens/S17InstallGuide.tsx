import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, SecondaryAction } from '../components';
import { t } from '../i18n';
import { appInstall, detectPlatform, useInstall } from '../offline';
import '../offline/offline.css';
import { ScreenFrame } from './ScreenFrame';

// S17 Install guide (R-701): assisted add-to-home-screen in the UI language, per platform.
// Android uses the browser's install prompt when offered, else the ⋮ menu steps; iOS walks the
// Share → Add to Home Screen steps; standalone shows "Installed". No save queue is promised:
// the installed iOS app starts with separate storage (R-703).
export default function S17InstallGuide() {
  const nav = useNavigate();
  const q = new URLSearchParams(useLocation().search);
  const ref = q.get('ref');
  const fromGate = q.get('from') === 'passage';
  const install = useInstall();
  const platform = typeof navigator !== 'undefined' ? detectPlatform(navigator) : 'desktop';
  const [step, setStep] = useState(1);
  const [skip, setSkip] = useState(false);
  const done = () => nav('/downloads');

  if (install.standalone) {
    return (
      <ScreenFrame id="S17" primaryLabel={t('s.install.primary.done')} onPrimary={done}>
        <Card title={t('s.install.installed')}>
          <p>{t('s.install.installed-body')}</p>
        </Card>
      </ScreenFrame>
    );
  }

  if (platform === 'desktop') {
    return (
      <ScreenFrame id="S17" primaryLabel={t('s.install.primary.done')} onPrimary={done}>
        <p className="fia-install__steps">{t('s.install.desktop')}</p>
      </ScreenFrame>
    );
  }

  const prompt = platform === 'android' && install.available;
  const steps =
    platform === 'ios'
      ? [
          [t('s.install.ios.step1.title'), t('s.install.ios.step1.body')],
          [t('s.install.ios.step2.title'), t('s.install.ios.step2.body')],
          [
            t('s.install.ios.step3.title'),
            ref ? t('s.install.ios.step3.body', { ref }) : t('s.install.ios.step3.body-no-ref'),
          ],
        ]
      : [
          [t('s.install.android.step1.title'), ''],
          [t('s.install.android.step2.title'), ''],
          [t('s.install.android.step3.title'), ''],
        ];
  const last = step >= steps.length;
  const primaryLabel = prompt
    ? t('s.install.primary.install')
    : last
      ? t('s.install.primary.done')
      : t('s.install.primary.next');
  const onPrimary = prompt
    ? () => void appInstall?.install()
    : last
      ? done
      : () => setStep((n) => n + 1);

  return (
    <ScreenFrame
      id="S17"
      primaryLabel={primaryLabel}
      primaryState={install.pending ? 'loading' : 'default'}
      onPrimary={onPrimary}
    >
      <div className="fia-install__steps">
        <p>{t('s.install.why')}</p>
        {install.error && (
          <p className="fia-dl__band fia-dl__band--error" role="alert">
            {t('s.install.error.android')}
          </p>
        )}
        {!prompt && (
          <>
            <p className="fia-caption">{t('s.install.step-of', { n: step })}</p>
            <Card title={steps[step - 1][0]}>
              {steps[step - 1][1] && <p>{steps[step - 1][1]}</p>}
            </Card>
            {step > 1 && (
              <SecondaryAction
                label={t('s.install.previous')}
                onPress={() => setStep((n) => n - 1)}
              />
            )}
          </>
        )}
        {platform === 'ios' &&
          fromGate &&
          (skip ? (
            <div className="fia-dl__band" role="alertdialog">
              <p>{t('s.install.skip-warn')}</p>
              <SecondaryAction label={t('s.install.skip-yes')} onPress={() => nav(-1)} />
              <SecondaryAction label={t('s.install.skip-no')} onPress={() => setSkip(false)} />
            </div>
          ) : (
            <SecondaryAction label={t('s.install.skip')} onPress={() => setSkip(true)} />
          ))}
        <p className="fia-caption">{t('s.install.later-note')}</p>
      </div>
    </ScreenFrame>
  );
}
