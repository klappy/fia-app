import { useLocation, useNavigate } from 'react-router-dom';
import { Sheet } from '../components';
import { CatalogRow, GlassChip, GlassSurface, Icon, type KitIconName } from '../components/glass';
import { KitPrimary } from '../components/PrimaryButton';
import { t } from '../i18n';
import { languageName } from '../media/lang';
import { browserStore, loadSettings } from '../settings';
import { provenanceSheet, type SheetRow } from '../media/provenance';
import {
  sheetTypeKey,
  sourceLineParts,
  sourceLineValues,
  type ProvenanceSheetState,
} from '../media/sheet';

// SH-1 — Provenance info sheet, "About this voice" (spec 20; R-313, R-503, C-06), v2 on the kit's
// navigation/GlassSheet over the screen it rises from (nodded mock design/alpha-v2-screens/
// 20-sheet-provenance-info.html): logo · mark · title, the part it is about, the body in user words,
// two status chips (voice, text), the source line verbatim (R-312), quiet rows (kit CatalogRow, icon +
// label) and one primary, Close. AI-made content is always named as AI, never as source; Scripture text
// is never AI. The caller passes the item's slot; with none, the default is AI voice on a unit.
const DEFAULT_STATE: ProvenanceSheetState = {
  domain: 'audio',
  slot: { status: 'generated' },
};

const MARK_ICON = {
  source: 'mic',
  'ai-voice': 'sparkle',
  'ai-translation': 'sparkle',
  absent: 'info',
} as const;

export interface ProvenanceSheetProps {
  open?: boolean;
  onClose: () => void;
  input: ProvenanceSheetState;
  /** "Narration for part 4 of 25 · Mark 1:1–13" */
  description?: string;
  /** what the text on screen is: from the FIA guide, or a computer translation (S05 only) */
  textMark?: 'source' | 'ai-translation';
  /** C-16 `screen` for the feedback row */
  from?: string;
}

export function ProvenanceSheet({
  open = true,
  onClose,
  input,
  description,
  textMark,
  from,
}: ProvenanceSheetProps) {
  const nav = useNavigate();
  const model = provenanceSheet(input);
  const rights = sourceLineValues(model, input);
  // The title glyphs ({src} {ai} {absent}) give way to the kit mark beside the title.
  const values = {
    src: '',
    ai: '',
    absent: '',
    language: input.language ?? '',
    edition: input.edition ?? '',
    type: t(sheetTypeKey(input)),
    collection: input.slot?.provenance?.collection ?? '',
  };
  const go = (to: string) => {
    onClose();
    nav(to);
  };
  const rowFor = (r: SheetRow): { icon: KitIconName; label: string; to: string } => {
    if (r === 'rights') return { icon: 'book', label: t('s.prov.rights'), to: '/about' };
    if (r === 'change-settings')
      return { icon: 'settings', label: t('s.prov.change-settings'), to: '/settings' };
    return {
      icon: 'message',
      label: t('s.prov.report'),
      to: from ? `/feedback?from=${encodeURIComponent(from)}` : '/feedback',
    };
  };
  const rows = model.rows.map(rowFor);
  if (input.guidePart) {
    // Mock 20 (FINAL SPEC perScreen S20): read without voice → S14, other languages → S19.
    rows.push({ icon: 'book', label: t('s.prov.row.read-without-voice'), to: '/settings' });
    rows.push({ icon: 'mic', label: t('s.prov.row.coverage'), to: '/coverage' });
  }
  const voiceWords =
    model.mark === 'source'
      ? t('s.common.mark.source')
      : model.mark === 'absent'
        ? t('s.guide.voice-none')
        : t('s.common.mark.ai-voice');
  return (
    <Sheet
      brand
      open={open}
      title={t(model.titleKey, values).trim()}
      titleIcon={
        <span className="fia-prov-mark" aria-hidden>
          <Icon name={MARK_ICON[model.mark]} size={17} />
        </span>
      }
      description={description}
      onClose={onClose}
      closeButton={false}
      className="fia-sheet--prov"
      state={model.mark === 'absent' ? 'empty' : 'default'}
      actions={<KitPrimary label={t('s.prov.primary.close')} icon="x" onPress={onClose} />}
    >
      {model.bodyKeys
        .filter((k) => k !== 's.prov.body.source-speaker' || values.collection)
        .map((k) => (
          <p key={k} className="fia-body fia-prov-body">
            {t(k, values)}
          </p>
        ))}
      {input.guidePart && (
        <div className="fia-prov-flags">
          <GlassChip
            className="fia-chip fia-prov-flag"
            leading={<Icon name={MARK_ICON[model.mark]} size={13} />}
          >
            <span>
              {t('s.prov.flag.voice')} <b>{voiceWords}</b>
            </span>
          </GlassChip>
          {textMark && (
            <GlassChip
              className="fia-chip fia-prov-flag"
              leading={<Icon name={textMark === 'source' ? 'check' : 'sparkle'} size={13} />}
            >
              {textMark === 'source' ? (
                <span>
                  {t('s.prov.flag.text')} <b>{t('s.prov.flag.text-fia')}</b>
                  {t('s.prov.flag.not-ai')}
                </span>
              ) : (
                <span>
                  {t('s.prov.flag.text')} <b>{t('s.common.mark.ai-translation')}</b>
                </span>
              )}
            </GlassChip>
          )}
        </div>
      )}
      {rights && (
        <p className="fia-caption fia-prov-source">
          {/* no values: placeholders stay in the template and are split into ltr spans */}
          {sourceLineParts(t('s.prov.source'), rights).map((p, i) =>
            p.ltr ? (
              <span key={i} dir="ltr">
                {p.text}
              </span>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </p>
      )}
      <GlassSurface
        level={3}
        blur="soft"
        radius="xl"
        shadow="none"
        className="fia-well fia-prov-rows"
      >
        <ul className="fia-more__list">
          {rows.map((r, i) => (
            <li key={r.label}>
              <CatalogRow
                className="fia-catalog fia-more__row"
                first={i === 0}
                onOpen={() => go(r.to)}
                title={
                  <span className="fia-row-label">
                    <Icon name={r.icon} size={18} />
                    {r.label}
                  </span>
                }
                meta={<Icon name="chevronRight" size={16} />}
              />
            </li>
          ))}
        </ul>
      </GlassSurface>
    </Sheet>
  );
}

// Route host (/sheet/provenance): S08, S10–S12 open the sheet with the item's slot as route state.
export default function SH1ProvenanceInfo() {
  const nav = useNavigate();
  const loc = useLocation();
  const s = (loc.state as ProvenanceSheetState | null) ?? DEFAULT_STATE;
  // The body names the content language; a caller without one gets the phone's content language.
  const language =
    s.language ?? languageName(loadSettings(browserStore()).settings.contentLanguage);
  return <ProvenanceSheet input={{ ...s, language }} onClose={() => nav(-1)} />;
}
