import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FiaLogo } from '../components/FiaLogo';
import { GlassButton, GlassSurface, Icon } from '../components/glass';
import { t } from '../i18n';

// Header (mock Header + LangPill + ExploreButton + CloseHeader, cookbook design/alpha-v2-screens/_frame.js:223-250):
// FiaLogo · the offline chip · language pill · Explore on a hub frame, or FiaLogo · one labelled way back
// on a layer frame. Lifted out of ScreenFrame so a screen composes it, never redraws it. The big-text
// grid (_frame.css:89-92) is the follow-up; today's geometry is unchanged.

// Header pill geometry from the nodded mock (_frame.js:224-229): 48 px tall, 10 × 16 padding.
const PILL = { minHeight: 48, padding: '10px 16px' };
// The offline chip at the pills' type size and padding (HubFit 2): kit tokens, as GlassButton md sets them.
const CHIP_TIGHT = { fontSize: 'var(--fs-label)', paddingInline: 'var(--sp-6)' };

/**
 * How tight the hub header sits (`useOneRowHub`). 0 is the mock. Each step keeps the one before it:
 * 1 · pills at the kit's --sp-6 (12 px) inline padding;
 * 2 · the logo as its symbol alone, the offline chip at the pills' type size and padding;
 * 3 · the pills drop their leading icons (the words stay);
 * 4 · Explore shows its compass alone (its word stays its accessible name); the language pill keeps its autonym.
 * Online the ladder stops at 1, as before (FU-d is the offline row); steps 2–4 are for the offline chip.
 */
export type HubFit = 0 | 1 | 2 | 3 | 4;

function pill(fit: HubFit) {
  return fit >= 1 ? { ...PILL, paddingInline: 'var(--sp-6)' } : PILL; // kit spacing token, 12 px
}

/** Language pill (mock LangPill): the content language's autonym; opens the language picker. */
export function LangPill({
  lang,
  onPress,
  fit = 0,
}: {
  lang: string;
  onPress: () => void;
  fit?: HubFit;
}) {
  return (
    <GlassButton
      variant="glass"
      className="fia-pill fia-lang"
      style={pill(fit)}
      leading={fit >= 3 ? undefined : <Icon name="languages" size={18} />}
      aria-label={t('s.common.language-pill', { language: lang })}
      onClick={onPress}
    >
      {lang}
    </GlassButton>
  );
}

/** Explore (mock ExploreButton): the one secondary entry; opens the Explore sheet. */
export function ExploreButton({ onPress, fit = 0 }: { onPress: () => void; fit?: HubFit }) {
  const word = t('s.common.explore');
  return (
    <GlassButton
      variant="glass"
      className="fia-pill fia-explore"
      style={fit >= 4 ? { ...pill(fit), minWidth: 'var(--sp-14)' } : pill(fit)}
      leading={fit === 3 ? undefined : <Icon name="compass" size={18} />}
      aria-haspopup="dialog"
      aria-label={fit >= 4 ? word : undefined}
      title={fit >= 4 ? word : undefined}
      onClick={onPress}
    >
      {fit >= 4 ? null : word}
    </GlassButton>
  );
}

export interface HeaderProps {
  /** Offline: the persistent text chip (toast-notice.md `chip`). */
  offline: boolean;
  /** Hub frame (guide, home, browse): the language pill and Explore. */
  hub?: { lang: string; onLang: () => void; onExplore: () => void };
  /** Layer frame (mock CloseHeader): the one labelled way back. Ignored on a hub frame. */
  close?: { label: string; onPress: () => void };
}

/** The row wraps when the grid is taller than its tallest item. */
function wraps(g: HTMLElement) {
  const tallest = Math.max(0, ...[...g.children].map((c) => c.getBoundingClientRect().height));
  return g.getBoundingClientRect().height > tallest + 1;
}

/**
 * Keep the hub header on one row (mock 02-library). When the items would wrap (longer UI strings,
 * e.g. Spanish at 390 px, or the offline chip beside the pills), step down the `HubFit` ladder until
 * they fit. English online at 390 px fits at 0 and is untouched. If even the last step wraps (big
 * text sizes), the header wraps as designed (see `rest`).
 *
 * It re-fits when the grid's width changes (ResizeObserver), when the row starts to wrap without a
 * width change (a label grows or a late font swaps in, ResizeObserver on the grid's height), when the
 * labels change (`key`), and when web fonts finish loading (`document.fonts`).
 */
function useOneRowHub(
  grid: React.RefObject<HTMLDivElement | null>,
  on: boolean,
  offline: boolean,
  key: string,
): HubFit {
  const max: HubFit = offline ? 4 : 1;
  // Where the ladder rests when even its last step wraps: online keeps the tight pills (as before);
  // offline goes back to the mock, so a big-text header wraps as designed, not half-compacted.
  const rest: HubFit = offline ? 0 : 1;
  const [fit, setFit] = useState<HubFit>(0);
  const [pass, setPass] = useState(0);
  const fonts = useRef(0);
  const gaveUp = useRef(''); // the width|labels|fonts at which even the last step wrapped
  const sig = useCallback(
    (g: HTMLElement) => `${Math.round(g.clientWidth)}|${key}|${fonts.current}`,
    [key],
  );
  const refit = useCallback(() => {
    setFit(0);
    setPass((p) => p + 1);
  }, []);

  // Climb the ladder, one step per layout pass, before paint.
  useLayoutEffect(() => {
    const g = grid.current;
    if (!on || !g) return;
    const s = sig(g);
    if (fit === rest && gaveUp.current === s) return; // wraps as designed
    if (!wraps(g)) return;
    if (fit < max) setFit((fit + 1) as HubFit);
    else {
      gaveUp.current = s;
      setFit(rest);
    }
  }, [grid, on, max, rest, fit, pass, sig]);

  // New labels (language switch, offline chip): start again from the mock.
  useLayoutEffect(() => {
    if (on) refit();
  }, [on, key, refit]);

  useEffect(() => {
    const g = grid.current;
    if (!on || !g) return;
    let width = g.clientWidth;
    const ro =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (g.clientWidth !== width) {
              width = g.clientWidth;
              refit();
            } else if (wraps(g) && gaveUp.current !== sig(g)) refit();
          });
    ro?.observe(g);
    const fs = typeof document !== 'undefined' ? document.fonts : undefined;
    const fontsLoaded = () => {
      fonts.current += 1;
      refit();
    };
    let live = true;
    void fs?.ready.then(() => {
      if (live) fontsLoaded();
    });
    fs?.addEventListener?.('loadingdone', fontsLoaded);
    return () => {
      live = false;
      ro?.disconnect();
      fs?.removeEventListener?.('loadingdone', fontsLoaded);
    };
  }, [grid, on, sig, refit]);

  return on ? fit : 0;
}

export function Header({ offline, hub, close }: HeaderProps) {
  const grid = useRef<HTMLDivElement>(null);
  const fit = useOneRowHub(
    grid,
    !!hub,
    offline,
    `${hub?.lang ?? ''}|${offline}|${t('s.common.explore')}`,
  );
  return (
    <header className="fia-header-wrap">
      <GlassSurface level={3} blur="strong" radius="pill" shadow="card" className="fia-header">
        <div className="fia-header-grid" ref={grid}>
          <FiaLogo mark={fit >= 2} />
          {offline && (
            // toast-notice.md `chip`: persistent while offline; text, never icon-only.
            <span
              className="fia-notice fia-notice--offline-chip"
              role="status"
              data-role="offline-chip"
              style={fit >= 2 ? CHIP_TIGHT : undefined}
            >
              <span aria-hidden="true">⊘ </span>
              {t('s.common.offline-chip')}
            </span>
          )}
          {close && !hub && (
            <GlassButton
              variant="quiet"
              className="fia-pill fia-close-back"
              style={PILL}
              leading={<Icon name="chevronLeft" size={18} />}
              onClick={close.onPress}
            >
              {close.label}
            </GlassButton>
          )}
          {hub && <LangPill lang={hub.lang} onPress={hub.onLang} fit={fit} />}
          {hub && <ExploreButton onPress={hub.onExplore} fit={fit} />}
        </div>
      </GlassSurface>
    </header>
  );
}
