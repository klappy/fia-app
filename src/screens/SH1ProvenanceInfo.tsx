import { useLocation, useNavigate } from 'react-router-dom';
import { SecondaryAction, Sheet } from '../components';
import { t } from '../i18n';
import { provenanceSheet, TITLE_GLYPHS } from '../media/provenance';
import {
  sheetTypeKey,
  sourceLineParts,
  sourceLineValues,
  type ProvenanceSheetState,
} from '../media/sheet';

// SH-1 — Provenance info sheet (spec 20; R-313, R-503, C-06). User words only; AI-made content
// is always named as AI and never as source; Scripture text is never AI. The caller passes the
// item's slot as route state; with none, the sheet shows the default (AI voice on a unit).
const DEFAULT_STATE: ProvenanceSheetState = {
  domain: 'audio',
  slot: { status: 'generated' },
};

export default function SH1ProvenanceInfo() {
  const nav = useNavigate();
  const loc = useLocation();
  const s = (loc.state as ProvenanceSheetState | null) ?? DEFAULT_STATE;
  const model = provenanceSheet(s);
  const rights = sourceLineValues(model, s);
  const values = {
    ...TITLE_GLYPHS,
    language: s.language ?? '',
    edition: s.edition ?? '',
    type: t(sheetTypeKey(s)),
    collection: s.slot?.provenance?.collection ?? '',
  };
  return (
    <Sheet
      brand
      title={t(model.titleKey, values).trim()}
      primaryLabel={t('s.prov.primary.close')}
      onClose={() => nav(-1)}
      onPrimary={() => nav(-1)}
    >
      <div className={`fia-mark fia-mark--${model.mark}`} aria-hidden />
      {model.bodyKeys
        .filter((k) => k !== 's.prov.body.source-speaker' || values.collection)
        .map((k) => (
          <p key={k}>{t(k, values)}</p>
        ))}
      {rights && (
        <p className="fia-caption">
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
      {model.rows.includes('rights') && (
        <SecondaryAction label={`${t('s.prov.rights')} ⟶`} onPress={() => nav('/about')} />
      )}
      {model.rows.includes('change-settings') && (
        <SecondaryAction
          label={`${t('s.prov.change-settings')} ⟶`}
          onPress={() => nav('/settings')}
        />
      )}
      {model.rows.includes('report') && (
        <SecondaryAction label={`${t('s.prov.report')} ⟶`} onPress={() => nav('/feedback')} />
      )}
    </Sheet>
  );
}
