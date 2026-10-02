import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FeedbackForm, ToastNotice } from '../components';
import {
  OUTBOX_LIMIT,
  Outbox,
  appVersion,
  buildFeedback,
  defaultTransport,
  onOutboxChange,
  refOf,
  type FeedbackContextInput,
} from '../feedback';
import { flowSession } from '../flow/session';
import { t } from '../i18n';
import { LANGUAGES } from '../i18n/languages';
import { browserStore, loadSettings } from '../settings';
import { SCREENS } from './registry';
import { ScreenFrame } from './ScreenFrame';
import './l5-shell.css';

// S16 Feedback (design/alpha-screens/16-feedback.md; R-705). Builds a C-16 payload, validates it
// and queues it in the local outbox, then posts it at once when online. "Received" is shown only
// after a 2xx from the feedback endpoint; offline or on any failure the honest amber "Queued"
// result shows and the item stays `waiting` until the outbox flushes it (online / app open).
// Context: passage, unit and screen come from the query (`?from=&pack=&unit=`) or else from the
// live guide session; the content language is the pack's language when a pack is known.
const PACK = /^[a-z]{3}(-[A-Za-z]{2,8})?\.[1-3A-Z]{3}(-\d{1,3}){2,4}$/;
const UNIT = /^S0[1-6]-U\d{3}$/;
const SCREEN = /^S\d{2}$/;

type Phase = { kind: 'compose' } | { kind: 'result'; ref: string; queued: boolean; at?: string };

const LANG_OF_PACK = /^([a-z]{3}(?:-[A-Za-z]{2,8})?)\./;
const langName = (code: string) => LANGUAGES.find((l) => l.code === code)?.autonym ?? code;

/** "Back to {where}": the screen's own title when known, else Guide. */
const whereName = (from?: string) => {
  const def = SCREENS.find((x) => x.id === from);
  return def?.titleKey ? t(def.titleKey) : (def?.name ?? t('s.common.dock.guide'));
};

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
  const [badContact, setBadContact] = useState(false);
  // Why the last Send did not queue. Never claims the message was kept when it was not.
  const [notice, setNotice] = useState<null | 'error' | 'not-saved' | 'full'>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'compose' });
  const [online, setOnline] = useState(() => globalThis.navigator?.onLine ?? true);
  const [sending, setSending] = useState(false);
  // re-render "Your feedback" when the outbox flushes in the background
  const [, setRev] = useState(0);
  useEffect(() => {
    const off = onOutboxChange(() => setRev((n) => n + 1));
    setRev((n) => n + 1); // catch a flush that landed between first render and subscribe
    return off;
  }, []);
  // where the person was: the live guide session (read once; S16 never loads a guide itself)
  const [flow] = useState(() => {
    const snap = flowSession().get();
    const guide = snap.guide && snap.guide.packId === snap.packId ? snap.guide : undefined;
    return {
      packId: snap.packId,
      title: guide?.title,
      unitId: guide ? snap.state?.unitId : undefined,
    };
  });

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
  const pack = params.get('pack') ?? flow.packId;
  const packId = pack && PACK.test(pack) ? pack : undefined;
  const unit = params.get('unit') ?? (packId && packId === flow.packId ? flow.unitId : undefined);
  const unitId = unit && UNIT.test(unit) ? unit : undefined;
  const ctx: FeedbackContextInput = {
    appVersion: appVersion(),
    uiLanguage: settings.uiLanguage,
    contentLanguage: (packId && LANG_OF_PACK.exec(packId)?.[1]) || settings.contentLanguage,
    packId,
    unitId,
    screen: from && SCREEN.test(from) ? from : undefined,
    theme,
    // C-16 textSize is system|large|max; C-10 gained `huge` (310%, F6-S14), reported as its nearest C-16 value.
    textSize: settings.textSize === 'huge' ? 'max' : settings.textSize,
    lowLiteracy: settings.lowLiteracy,
    offline: !online,
    installed: globalThis.matchMedia?.('(display-mode: standalone)').matches,
    userAgent: globalThis.navigator?.userAgent,
  };
  // One fact per line (16-feedback.md § layout): passage · unit · screen · content language ·
  // version / theme / size. Exactly what the payload carries, nothing hidden.
  const passage = ctx.packId && ctx.packId === flow.packId && flow.title ? flow.title : ctx.packId;
  const contextLines = [
    passage,
    ctx.unitId && t('s.feedback.where.unit', { unit: ctx.unitId }),
    ctx.screen && t('s.feedback.where.screen', { screen: ctx.screen }),
    `${langName(ctx.contentLanguage)} (${ctx.contentLanguage})`,
    [`v${ctx.appVersion.split('+')[0]}`, ctx.theme, ctx.textSize].filter(Boolean).join(' · ') +
      (ctx.offline ? ` ${t('s.feedback.context-offline')}` : ''),
  ].filter((l): l is string => !!l);

  const send = async () => {
    if (sending) return;
    const r = buildFeedback({ text, contact }, ctx);
    if (!r.ok) {
      if (r.reason === 'need-text') setNeedText(true);
      else if (r.reason === 'bad-contact') setBadContact(true);
      else setNotice('error');
      return;
    }
    setBadContact(false);
    setNotice(null);
    if (outbox.full()) {
      setNotice('full');
      return;
    }
    if (!outbox.enqueue(r.payload)) {
      setNotice('not-saved');
      return;
    }
    const id = r.payload.id;
    if (online && defaultTransport) {
      setSending(true);
      try {
        await outbox.flush(defaultTransport, { ids: [id] });
      } finally {
        setSending(false);
      }
    }
    const item = outbox.get(id);
    if (item?.status === 'failed') {
      // refused for good (e.g. 400): never claim it was kept or sent; the draft stays
      setNotice('error');
      return;
    }
    setPhase({
      kind: 'result',
      ref: refOf(id),
      queued: item?.status !== 'received',
      at: item?.receivedAt,
    });
    setText('');
    setContact('');
  };

  const yours = outbox.recent(10);
  const back = () => navigate(-1);

  if (phase.kind === 'result') {
    return (
      <ScreenFrame
        id="S16"
        offline={!online}
        primaryLabel={t('s.feedback.primary.back', { where: whereName(from) })}
        onPrimary={back}
      >
        <ToastNotice kind="banner" tone={phase.queued ? 'stop' : 'info'}>
          {phase.queued
            ? t('s.feedback.queued')
            : t('s.feedback.received', { time: fmtTime(phase.at ?? new Date().toISOString()) })}
        </ToastNotice>
        <p>{t('s.feedback.thanks', { ref: phase.ref })}</p>
        {phase.queued && <p className="fia-caption">{t('s.feedback.waiting-hint')}</p>}
        <YourFeedback items={yours} />
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame
      id="S16"
      offline={!online}
      onPrimary={send}
      primaryLabel={sending ? t('s.feedback.primary.sending') : undefined}
      primaryState={sending ? 'loading' : undefined}
    >
      {!outbox.persistent && (
        <ToastNotice kind="banner" tone="stop">
          {t('s.feedback.cannot-queue')}
        </ToastNotice>
      )}
      {notice && outbox.persistent && (
        <ToastNotice kind="banner" tone="error">
          {notice === 'full'
            ? t('s.feedback.outbox-full', { n: OUTBOX_LIMIT })
            : t(notice === 'not-saved' ? 's.feedback.not-saved' : 's.feedback.error')}
        </ToastNotice>
      )}
      <FeedbackForm
        text={text}
        contact={contact}
        onText={(v) => {
          setText(v);
          if (v.trim()) setNeedText(false);
        }}
        onContact={(v) => {
          setContact(v);
          setBadContact(false);
        }}
        contextLines={contextLines}
        needText={needText}
        contactInvalid={badContact}
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
                  : i.status === 'failed'
                    ? t('s.feedback.row-failed', { ref, time })
                    : t('s.feedback.row-waiting', { ref, time })}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
