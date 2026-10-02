import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FeedbackForm, ToastNotice } from '../components';
import { GlassSurface, Icon, type KitIconName } from '../components/glass';
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
import { position } from '../flow/model';
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
// F6-S16 glass skin (mock design/alpha-v2-screens/16-feedback{,.queued,.received}.html): the result
// band and "Your feedback" sit on kit GlassSurface with kit Icon; the words carry the state and the
// icon repeats it (aria-hidden). The flow, payload and outbox are unchanged (kept bones).
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

/** The v1 strings lead with a state glyph (⊘ ✓ ✕); the glass skin draws it as a kit icon instead. */
const GLYPH: Record<string, KitIconName> = { '⊘': 'cloudOff', '✓': 'check', '✕': 'x' };
function glyphed(s: string): { icon?: KitIconName; words: string } {
  const m = /^([⊘✓✕])\s*/.exec(s);
  return m ? { icon: GLYPH[m[1]], words: s.slice(m[0].length) } : { words: s };
}

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
      guide,
      unitId: guide ? snap.state?.unitId : undefined,
      /** C-03 catalog title of each pack (words), when the catalog is loaded. */
      titles: new Map(snap.manifest?.entries.map((e) => [e.packId, e.title]) ?? []),
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
  // One line in words (mock 16-feedback.html:147): passage · step title, part n · language
  // (s.feedback.context-human). Ids (pack, unit, screen) and version, theme and size ride in the
  // C-16 payload only, never on screen (design-lens rule 5; dl-v21-support-04, dl-f6s16-01/02,
  // pl-f6s16-02); offline shows in the header chip.
  const guide = ctx.packId && ctx.packId === flow.packId ? flow.guide : undefined;
  const passage = guide?.title ?? (ctx.packId && flow.titles.get(ctx.packId));
  const language = langName(ctx.contentLanguage);
  const inGuide =
    guide && ctx.unitId && guide.steps.some((s) => s.units.some((u) => u.id === ctx.unitId));
  const at = inGuide && ctx.unitId ? position(guide, ctx.unitId) : undefined;
  const contextLines = [
    passage && at
      ? t('s.feedback.context-human', {
          ref: passage,
          stage: at.stageTitle,
          unit: String(at.unitIndex + 1),
          language,
        })
      : [passage, language].filter(Boolean).join(' · '),
  ];

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
        <ResultBand
          queued={phase.queued}
          title={
            phase.queued
              ? t('s.feedback.queued')
              : t('s.feedback.received', { time: fmtTime(phase.at ?? new Date().toISOString()) })
          }
          refLine={t('s.feedback.thanks', { ref: phase.ref })}
        />
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
        paused={from === 'S05'}
        needText={needText}
        contactInvalid={badContact}
      />
      <YourFeedback items={yours} />
    </ScreenFrame>
  );
}

/** After Send: the status band (queued is amber-honest: kept on this phone, not sent). */
function ResultBand({
  queued,
  title,
  refLine,
}: {
  queued: boolean;
  title: string;
  refLine: string;
}) {
  const head = glyphed(title);
  return (
    <GlassSurface
      level={2}
      blur="strong"
      radius="xl"
      shadow="card"
      className="fia-feedback-band"
      data-state={queued ? 'queued' : 'received'}
    >
      <div className="fia-feedback__inner" role="status">
        <p className="fia-feedback-band__title">
          <Icon name={head.icon ?? (queued ? 'cloudOff' : 'check')} size={22} stroke={2} />
          <span>{head.words}</span>
        </p>
        {queued && <p className="fia-feedback-band__text">{t('s.feedback.waiting-hint')}</p>}
        <p className="fia-feedback-band__ref">{refLine}</p>
      </div>
    </GlassSurface>
  );
}

function YourFeedback({ items }: { items: ReturnType<Outbox['recent']> }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="s16-yours" className="fia-feedback-yours">
      <h2 id="s16-yours" className="fia-overline">
        {t('s.feedback.yours')}
      </h2>
      <GlassSurface level={2} blur="medium" radius="xl" shadow="rest">
        <ul role="list" className="fia-feedback__inner">
          {items.map((i) => {
            const ref = refOf(i.payload.id);
            const time = fmtTime(i.receivedAt ?? i.queuedAt);
            const row = glyphed(
              i.status === 'received'
                ? t('s.feedback.row-received', { ref, time })
                : i.status === 'failed'
                  ? t('s.feedback.row-failed', { ref, time })
                  : t('s.feedback.row-waiting', { ref, time }),
            );
            return (
              <li key={i.payload.id}>
                <button
                  type="button"
                  className="fia-feedback-row"
                  data-status={i.status}
                  aria-label={`${row.words}. ${t('s.feedback.copy-ref', { ref })}`}
                  onClick={() => void globalThis.navigator?.clipboard?.writeText(i.payload.id)}
                >
                  {row.icon && <Icon name={row.icon} size={16} />}
                  <span>{row.words}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </GlassSurface>
    </section>
  );
}
