import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FeedbackForm, ToastNotice } from '../components';
import {
  Outbox,
  appVersion,
  buildFeedback,
  defaultTransport,
  refOf,
  type FeedbackContextInput,
} from '../feedback';
import { t } from '../i18n';
import { browserStore, loadSettings } from '../settings';
import { ScreenFrame } from './ScreenFrame';
import './l5-shell.css';

// S16 Feedback (design/alpha-screens/16-feedback.md; R-705). Builds a C-16 payload, validates it
// and queues it in the local outbox. STUB: no feedback endpoint exists yet, so every submission
// lands on the honest amber "Queued" result and stays `waiting` in "Your feedback"; "Received" is
// shown only after a 2xx, which cannot happen until the endpoint (Otto) is wired.
const PACK = /^[a-z]{3}(-[A-Za-z]{2,8})?\.[1-3A-Z]{3}(-\d{1,3}){2,4}$/;
const UNIT = /^S0[1-6]-U\d{3}$/;
const SCREEN = /^S\d{2}$/;

type Phase = { kind: 'compose' } | { kind: 'result'; ref: string; queued: boolean };

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export default function S16Feedback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [store] = useState(browserStore);
  const outbox = useMemo(() => new Outbox(store), [store]);
  const settings = useMemo(() => loadSettings(store).settings, [store]);
  const [text, setText] = useState('');
  const [contact, setContact] = useState('');
  const [needText, setNeedText] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'compose' });
  const [online, setOnline] = useState(() => globalThis.navigator?.onLine ?? true);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener('online', on);
    addEventListener('offline', off);
    return () => {
      removeEventListener('online', on);
      removeEventListener('offline', off);
    };
  }, []);
  useEffect(() => {
    if (!needText) return;
    const id = setTimeout(() => setNeedText(false), 3000);
    return () => clearTimeout(id);
  }, [needText]);

  const theme: 'light' | 'dark' =
    settings.theme !== 'system'
      ? settings.theme
      : globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  const from = params.get('from') ?? undefined;
  const pack = params.get('pack') ?? undefined;
  const unit = params.get('unit') ?? undefined;
  const ctx: FeedbackContextInput = {
    appVersion: appVersion(),
    uiLanguage: settings.uiLanguage,
    contentLanguage: settings.contentLanguage,
    packId: pack && PACK.test(pack) ? pack : undefined,
    unitId: unit && UNIT.test(unit) ? unit : undefined,
    screen: from && SCREEN.test(from) ? from : undefined,
    theme,
    textSize: settings.textSize,
    lowLiteracy: settings.lowLiteracy,
    offline: !online,
    installed: globalThis.matchMedia?.('(display-mode: standalone)').matches,
    userAgent: globalThis.navigator?.userAgent,
  };
  const contextLines = [
    [
      `v${ctx.appVersion.split('+')[0]}`,
      ctx.contentLanguage,
      ctx.packId,
      ctx.unitId,
      ctx.theme,
      ctx.textSize,
    ]
      .filter(Boolean)
      .join(' · ') + (ctx.offline ? ` ${t('s.feedback.context-offline')}` : ''),
  ];

  const send = async () => {
    const r = buildFeedback({ text, contact }, ctx);
    if (!r.ok) {
      if (r.reason === 'need-text') setNeedText(true);
      else setInvalid(true);
      return;
    }
    setInvalid(false);
    if (!outbox.enqueue(r.payload)) {
      setInvalid(true);
      return;
    }
    const delivered = online ? await outbox.flush(defaultTransport) : 0;
    setPhase({ kind: 'result', ref: refOf(r.payload.id), queued: delivered === 0 });
    setText('');
    setContact('');
  };

  const yours = outbox.recent(10);
  const back = () => navigate(-1);

  if (phase.kind === 'result') {
    return (
      <ScreenFrame
        id="S16"
        dockActive="more"
        offline={!online}
        primaryLabel={t('s.feedback.primary.back', { where: from ?? t('s.common.dock.guide') })}
        onPrimary={back}
      >
        <ToastNotice kind="banner" tone={phase.queued ? 'stop' : 'info'}>
          {phase.queued
            ? t('s.feedback.queued')
            : t('s.feedback.received', { time: fmtTime(new Date().toISOString()) })}
        </ToastNotice>
        <p>{t('s.feedback.thanks', { ref: phase.ref })}</p>
        {phase.queued && <p className="fia-caption">{t('s.feedback.waiting-hint')}</p>}
        <YourFeedback items={yours} />
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame id="S16" dockActive="more" offline={!online} onPrimary={send}>
      {!outbox.persistent && (
        <ToastNotice kind="banner" tone="stop">
          {t('s.feedback.cannot-queue')}
        </ToastNotice>
      )}
      {invalid && outbox.persistent && (
        <ToastNotice kind="banner" tone="error">
          {t('s.feedback.error')}
        </ToastNotice>
      )}
      <FeedbackForm
        text={text}
        contact={contact}
        onText={(v) => {
          setText(v);
          if (v.trim()) setNeedText(false);
        }}
        onContact={setContact}
        contextLines={contextLines}
        needText={needText}
      />
      <YourFeedback items={yours} />
    </ScreenFrame>
  );
}

function YourFeedback({ items }: { items: ReturnType<Outbox['recent']> }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="s16-yours">
      <h2 id="s16-yours" className="fia-group-header">
        {t('s.feedback.yours')}
      </h2>
      <ul role="list">
        {items.map((i) => {
          const ref = refOf(i.payload.id);
          const time = fmtTime(i.receivedAt ?? i.queuedAt);
          return (
            <li key={i.payload.id}>
              <button
                type="button"
                className="fia-link-row"
                aria-label={t('s.feedback.copy-ref', { ref })}
                onClick={() => void globalThis.navigator?.clipboard?.writeText(i.payload.id)}
              >
                {i.status === 'received'
                  ? t('s.feedback.row-received', { ref, time })
                  : t('s.feedback.row-waiting', { ref, time })}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
