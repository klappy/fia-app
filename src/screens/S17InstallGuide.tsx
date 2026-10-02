import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SecondaryAction } from '../components';
import { FiaLogo } from '../components/FiaLogo';
import { GlassSurface, Icon } from '../components/glass';
import { t } from '../i18n';
import { appInstall, detectPlatform, useInstall } from '../offline';
import '../offline/offline.css';
import { ScreenFrame } from './ScreenFrame';

// S17 Install guide (R-701): assisted add-to-home-screen in the UI language, per platform.
// Android uses the browser's install prompt when offered, else the ⋮ menu steps; iOS walks the
// Share → Add to Home Screen steps; standalone shows "Installed". No save queue is promised:
// the installed iOS app starts with separate storage (R-703).
// F6-S17 glass skin (mock design/alpha-v2-screens/17-install-guide.html; steps 1–3, ?os=android,
// ?from=about): the "Why install" and step cards are kit GlassSurface; the numbered, labelled steps,
// the "where" line and the drawings in the illustration well are app-layer (kit gaps, marked below).
// Flow, platform detection and the install controller are unchanged (kept bones).

// KIT GAP (fallback, PRD § 3; BUILD-ORDER K7; mock 17-install-guide.html "gap"): the kit Icon set
// @6aa9bc3 has no 'share' (iOS Share: a box with an up arrow) and no 'smartphone'. Drawn in the kit
// Icon's style (Lucide, 24 grid, round stroke 1.7, no fill) and marked data-kit-gap.
function GapGlyph({
  name,
  size = 18,
  children,
}: {
  name: string;
  size?: number;
  children: ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-kit-gap={name}
      className="fia-install__glyph"
    >
      {children}
    </svg>
  );
}
const ShareGlyph = ({ size }: { size?: number }) => (
  <GapGlyph name="share" size={size}>
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <path d="m16 6-4-4-4 4" />
    <path d="M12 2v13" />
  </GapGlyph>
);
const PhoneGlyph = ({ size }: { size?: number }) => (
  <GapGlyph name="smartphone" size={size}>
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
    <path d="M12 18h.01" />
  </GapGlyph>
);

/** The app's mark as a home-screen icon (the lockup's symbol, cropped; FiaLogo is never retyped). */
const AppMark = () => (
  <span className="fia-install__app" aria-hidden="true">
    <span className="fia-install__appmark">
      <FiaLogo size={18} />
    </span>
  </span>
);

// KIT GAP (fallback, PRD § 3; K7 "illustration slot"): app-owned drawings of the browser's own UI,
// one per step (v1 17-install-guide.md § Layout). Decorative: the step title and body say the same.
function Drawing({ kind }: { kind: 'ios1' | 'ios2' | 'ios3' | 'android' }) {
  if (kind === 'ios1')
    return (
      <div className="fia-install__draw" data-kit-gap="illustration">
        <GlassSurface
          level={3}
          blur="medium"
          radius="pill"
          shadow="rest"
          className="fia-install__bar"
        >
          <span className="fia-install__safari">
            <Icon name="chevronLeft" size={18} />
            <Icon name="chevronRight" size={18} />
            <span className="fia-install__ring fia-install__ring--round">
              <ShareGlyph size={18} />
            </span>
            <Icon name="book" size={18} />
            <Icon name="bookmark" size={18} />
          </span>
        </GlassSurface>
        <p className="fia-install__draw-caption">{t('s.install.draw.ios1-caption')}</p>
      </div>
    );
  if (kind === 'ios2')
    return (
      <div className="fia-install__draw" data-kit-gap="illustration">
        <GlassSurface
          level={3}
          blur="medium"
          radius="lg"
          shadow="rest"
          className="fia-install__sheet"
        >
          <span className="fia-install__sheet-row">
            <Icon name="bookmark" size={16} />
            {t('s.install.draw.add-bookmark')}
          </span>
          <span className="fia-install__sheet-row">
            <span className="fia-install__ring fia-install__ring--row">
              <Icon name="plus" size={16} />
            </span>
            {t('s.install.draw.add-home')}
          </span>
          <span className="fia-install__sheet-row">
            <Icon name="search" size={16} />
            {t('s.install.draw.find')}
          </span>
        </GlassSurface>
      </div>
    );
  if (kind === 'ios3')
    return (
      <div className="fia-install__draw" data-kit-gap="illustration">
        <GlassSurface
          level={3}
          blur="medium"
          radius="lg"
          shadow="rest"
          className="fia-install__dialog"
        >
          <span className="fia-install__dialog-row">
            <span>{t('s.install.draw.cancel')}</span>
            <span className="fia-install__ring fia-install__ring--word">
              {t('s.install.draw.add')}
            </span>
          </span>
          <span className="fia-install__app-row">
            <AppMark />
            <span className="fia-install__draw-caption">{t('s.install.draw.ios3-caption')}</span>
          </span>
        </GlassSurface>
      </div>
    );
  return (
    <div className="fia-install__draw" data-kit-gap="illustration">
      <GlassSurface
        level={3}
        blur="medium"
        radius="lg"
        shadow="rest"
        className="fia-install__dialog"
      >
        <span className="fia-install__dialog-title">{t('s.install.draw.install-app')}</span>
        <span className="fia-install__app-row">
          <AppMark />
          <span className="fia-install__app-name">
            {t('s.install.draw.app-name')}
            <span>{t('s.install.draw.app-host')}</span>
          </span>
        </span>
        <span className="fia-install__dialog-row fia-install__dialog-row--end">
          <span>{t('s.install.draw.cancel')}</span>
          <span className="fia-install__ring fia-install__ring--word">
            {t('s.install.draw.install')}
          </span>
        </span>
      </GlassSurface>
      <p className="fia-install__draw-caption">{t('s.install.draw.android-caption')}</p>
    </div>
  );
}

// KIT GAP (fallback, PRD § 3; K7 "step dots"): numbered, labelled install steps — '1 · 2 · 3', not
// the guide's coded beads (RULING (e) via the mock). Current = ink ring + semibold; done = kit check.
function StepList({ step, labels }: { step: number; labels: string[] }) {
  return (
    <ol className="fia-install__step-list" data-kit-gap="step-list">
      {labels.map((label, i) => {
        const n = i + 1;
        return (
          <li
            key={n}
            className={'fia-install__step' + (n < step ? ' is-done' : '')}
            aria-current={n === step ? 'step' : undefined}
          >
            <span className="fia-install__badge" aria-hidden="true">
              {n < step ? <Icon name="check" size={14} stroke={2.2} /> : n}
            </span>
            <span className="fia-install__step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** A kit-glass card; the inner div sits above the kit GlassSurface refraction layer. */
function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <GlassSurface
      level={2}
      blur="strong"
      radius="2xl"
      shadow="card"
      className={['fia-install__card', className].filter(Boolean).join(' ')}
    >
      <div className="fia-install__inner">{children}</div>
    </GlassSurface>
  );
}

/** The v1 strings lead with a state glyph (✓); the glass skin draws it as a kit icon instead. */
const unglyph = (s: string) => s.replace(/^✓\s*/, '');

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
        <div className="fia-install fia-install__steps">
          <Card>
            <h2 className="fia-install__title fia-install__title--icon">
              <Icon name="check" size={20} />
              <span>{unglyph(t('s.install.installed'))}</span>
            </h2>
            <p className="fia-install__body">{t('s.install.installed-body')}</p>
          </Card>
        </div>
      </ScreenFrame>
    );
  }

  if (platform === 'desktop') {
    return (
      <ScreenFrame id="S17" primaryLabel={t('s.install.primary.done')} onPrimary={done}>
        <div className="fia-install fia-install__steps">
          <Card>
            <p className="fia-install__body">{t('s.install.desktop')}</p>
          </Card>
        </div>
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
  const labels = [1, 2, 3].map((n) => t(`s.install.step-label.${platform}.${n}`));
  const last = step >= steps.length;
  const primaryLabel = prompt
    ? t('s.install.primary.install-fia')
    : last
      ? t('s.install.primary.done')
      : t('s.install.primary.next');
  const onPrimary = prompt
    ? () => void appInstall?.install()
    : last
      ? done
      : () => setStep((n) => n + 1);

  const [title, body] = prompt
    ? [t('s.install.android.prompt.title'), t('s.install.android.prompt.body')]
    : steps[step - 1];
  const drawing = prompt ? 'android' : platform === 'ios' ? (`ios${step}` as 'ios1') : null;
  // The quiet way out (mock): "Skip and save anyway" only for the iOS first-save gate (S04),
  // otherwise "Not now" back to where the person came from. None on the last step (Done leads).
  const gate = platform === 'ios' && fromGate;
  const showEnd = prompt || !last;
  const showPrev = !prompt && step > 1;

  return (
    <ScreenFrame
      id="S17"
      primaryLabel={primaryLabel}
      primaryState={install.pending ? 'loading' : 'default'}
      onPrimary={onPrimary}
    >
      <div className="fia-install fia-install__steps">
        {platform === 'ios' && (
          <GlassSurface
            level={2}
            blur="medium"
            radius="xl"
            shadow="rest"
            className="fia-install__why"
          >
            <div className="fia-install__inner">
              <p className="fia-install__overline">{t('s.install.why-title')}</p>
              <p className="fia-install__why-text">{t('s.install.why-first')}</p>
            </div>
          </GlassSurface>
        )}
        {install.error && (
          <p className="fia-dl__band fia-dl__band--error" role="alert">
            {t('s.install.error.android')}
          </p>
        )}
        <Card className="fia-install__step-card">
          {!prompt && (
            <>
              <p className="fia-install__overline">{t('s.install.step-of', { n: step })}</p>
              <StepList step={step} labels={labels} />
            </>
          )}
          <p className={'fia-install__where' + (prompt ? ' is-first' : '')}>
            <PhoneGlyph size={15} />
            <span>{t(`s.install.where.${platform}`)}</span>
          </p>
          <h2 className="fia-install__title">{title}</h2>
          {drawing && (
            <GlassSurface
              level={1}
              blur="soft"
              radius="xl"
              shadow="none"
              className="fia-install__well"
            >
              <div className="fia-install__well-inner">
                <Drawing kind={drawing} />
              </div>
            </GlassSurface>
          )}
          {body && <p className="fia-install__body">{body}</p>}
          <p className="fia-install__note">{t('s.install.already-short')}</p>
        </Card>
        {gate && skip ? (
          <GlassSurface
            level={2}
            blur="medium"
            radius="xl"
            shadow="rest"
            className="fia-install__warn"
          >
            <div className="fia-install__inner" role="alertdialog" aria-label={t('s.install.skip')}>
              <p className="fia-install__body">{t('s.install.skip-warn')}</p>
              <div className="fia-install__quiet">
                <SecondaryAction
                  className="fia-install__start"
                  label={t('s.install.skip-no')}
                  onPress={() => setSkip(false)}
                />
                <SecondaryAction
                  className="fia-install__end"
                  label={t('s.install.skip-yes')}
                  onPress={() => nav(-1)}
                />
              </div>
            </div>
          </GlassSurface>
        ) : (
          (showPrev || showEnd) && (
            <div className="fia-install__quiet">
              {showPrev && (
                <SecondaryAction
                  className="fia-install__start"
                  icon={<Icon name="chevronLeft" size={18} />}
                  label={t('s.install.previous')}
                  onPress={() => setStep((n) => n - 1)}
                />
              )}
              {showEnd &&
                (gate ? (
                  <SecondaryAction
                    className="fia-install__end fia-install__end--trailing"
                    icon={<Icon name="chevronRight" size={18} />}
                    label={t('s.install.skip')}
                    onPress={() => setSkip(true)}
                  />
                ) : (
                  <SecondaryAction
                    className="fia-install__end"
                    icon={<Icon name="x" size={18} />}
                    label={t('s.install.not-now')}
                    onPress={() => nav(-1)}
                  />
                ))}
            </div>
          )
        )}
      </div>
    </ScreenFrame>
  );
}
