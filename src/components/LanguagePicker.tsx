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
    };
    apply();
    const watch = new MutationObserver(apply);
    watch.observe(el, { childList: true, subtree: true });
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
