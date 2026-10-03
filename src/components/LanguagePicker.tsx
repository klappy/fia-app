import { useLayoutEffect, useMemo, useRef, type ComponentType } from 'react';
import { t } from '../i18n';
import { LanguagePicker as KitLanguagePicker } from '../vendor/glass/components/language/LanguagePicker';
import type {
  LanguagePickerProps as KitLanguagePickerProps,
  LanguageRow,
} from '../vendor/glass/components/language/LanguagePicker';
import { CHIP_KEYS, rowName, type PickerLanguage } from './languageRows';
import './LanguagePicker.css';

// PRD § 3 #8 `language-picker` (F6-S01): an app wrapper around kit language/LanguagePicker, never a
// redraw. It hands the kit the catalog rows with their coverage chips in the users' words
// (Scripture · Guide · Key terms · Maps, not the kit's Bible · Notes · Words · Maps), as the nodded mock
// does (cookbook design/alpha-v2-screens/01-first-run-language.html). Kit gaps the wrapper fills:
// the kit's rows are bare buttons, so it adds radio semantics (role, aria-checked, and a name that says
// each chip's state, which the kit draws only by edge and fill), and it labels the search field (the kit
// gives it a placeholder only). The kit's literal px and contrast are bent in LanguagePicker.css.
// Imported straight from the vendored kit path (G-F), so this row leaves the shared glass.ts alone.
// The kit draws its own chrome words in English with no prop for them (group heads, the "n of m" count,
// Clear, the empty line, the legend, the chip tooltips). The wrapper relabels those text nodes from the
// app catalog (`s.lang.kit.*`, `s.lang.empty-search`) in place — node data only, so React keeps its
// handles — and never patches the vendored kit (cookbook TICKET 2026-10-03-fia-spanish-ui-strings FU-a).

const KIT_STATES: Record<string, string> = {
  available: 's.lang.kit.state.available',
  'AI-translatable': 's.lang.kit.state.ai',
  none: 's.lang.kit.state.none',
};

/** The catalog's words for one English string the kit draws, or undefined when it is not kit chrome. */
function kitLabel(text: string): string | undefined {
  switch (text) {
    case 'Suggested':
      return t('s.lang.kit.suggested');
    case 'All languages':
      return t('s.lang.kit.all');
    case 'Clear':
      return t('s.lang.kit.clear');
    case 'Available':
      return t('s.lang.kit.legend.available');
    case 'AI-translatable':
      return t('s.lang.kit.legend.ai');
    case 'None':
      return t('s.lang.kit.legend.none');
    case 'Full coverage':
      return t('s.lang.kit.note.full');
    case 'No resources yet · you can still choose it':
      return t('s.lang.kit.note.none');
  }
  let m = /^(\d+) available · (\d+) AI-translatable$/.exec(text);
  if (m) return t('s.lang.kit.note.partial', { available: Number(m[1]), ai: Number(m[2]) });
  m = /^(\d+) of (\d+)$/.exec(text);
  if (m) return t('s.lang.kit.count', { shown: m[1], total: m[2] });
  m = /^Matches for “([\s\S]*)”$/.exec(text);
  if (m) return t('s.lang.kit.matches', { query: m[1] });
  if (/^Nothing matches “[\s\S]*”\. Try the English name, the code, or a country\.$/.test(text))
    return t('s.lang.empty-search');
  return undefined;
}

/** Relabels the kit's chrome text nodes and chip tooltips; rows' own words (autonyms) are left alone. */
function relabelKit(el: HTMLElement) {
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
    const own = n.parentElement?.closest('[lang]');
    if (own && el.contains(own)) continue;
    const next = kitLabel(n.data);
    if (next !== undefined && next !== n.data) n.data = next;
  }
  for (const chip of el.querySelectorAll<HTMLElement>('span[title]')) {
    const m = /^(.*) · (available|AI-translatable|none)$/.exec(chip.title);
    if (!m) continue;
    const next = t('s.lang.kit.chip-title', { type: m[1], state: t(KIT_STATES[m[2]]) });
    if (next !== chip.title) chip.title = next;
  }
}

// Typing only (as glass.ts): the kit's .d.ts omit the `...rest` the .jsx spreads on its root.
const KitPicker = KitLanguagePicker as unknown as ComponentType<
  KitLanguagePickerProps & { className?: string }
>;

export interface LanguagePickerProps {
  /** Catalog rows (languageRows.ts `pickerLanguages`), in catalog order. */
  languages: readonly PickerLanguage[];
  /** Aquifer code of the chosen row. */
  value?: string;
  onChange?: (code: string) => void;
  /** Codes pinned into the kit's Suggested group. */
  suggested?: readonly string[];
  title: string;
  placeholder: string;
  className?: string;
}

export function LanguagePicker({
  languages,
  value,
  onChange,
  suggested = [],
  title,
  placeholder,
  className,
}: LanguagePickerProps) {
  const root = useRef<HTMLDivElement>(null);
  const rows = useMemo<LanguageRow[]>(
    () =>
      languages.map((l) => ({
        code: l.code,
        autonym: l.autonym,
        english: l.english,
        dir: l.dir,
        coverage: l.chips.join(''),
      })),
    [languages],
  );
  const types = CHIP_KEYS.map((k) => t(`s.coverage.type.${k}`));

  // The kit re-renders its own list as the search narrows it, so the semantics are re-applied on every
  // change to its children, not only when this wrapper renders.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const names = new Map(languages.map((l) => [l.code, rowName(l)]));
    const apply = () => {
      el.querySelector('input')?.setAttribute('aria-label', placeholder);
      const list = el.querySelector('button [lang]')?.closest('button')?.parentElement;
      list?.setAttribute('role', 'radiogroup');
      list?.setAttribute('aria-label', title);
      for (const b of el.querySelectorAll('button')) {
        const code = b.querySelector('[lang]')?.getAttribute('lang');
        if (!code) continue;
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(code === value));
        b.setAttribute('data-code', code);
        const name = names.get(code);
        if (name) b.setAttribute('aria-label', name);
      }
      relabelKit(el);
    };
    apply();
    const watch = new MutationObserver(apply);
    watch.observe(el, { childList: true, subtree: true, characterData: true });
    return () => watch.disconnect();
  }, [languages, value, title, placeholder]);

  return (
    <div ref={root} className="fia-lp-wrap">
      <KitPicker
        className={['fia-lp', className].filter(Boolean).join(' ')}
        surface="sheet"
        context="attribute"
        title={title}
        placeholder={placeholder}
        languages={rows}
        value={value}
        suggested={[...suggested]}
        types={types}
        onChange={(code) => onChange?.(code)}
      />
    </div>
  );
}
