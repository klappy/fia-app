import { useNavigate, useSearchParams } from 'react-router-dom';
import { AbsentBadge, AudioControls, ProvenanceMark, SecondaryAction } from '../components';
import { t } from '../i18n';
import { languageName } from '../media/lang';
import { markFor, selectNarration } from '../media/provenance';
import { findTerm, htmlToParagraphs, type ResourcesPack } from '../media/resources';
import { PROVENANCE_SHEET_PATH, type ProvenanceSheetState } from '../media/sheet';
import { useClip } from '../media/useClip';
import { DEFAULT_PACK, packLanguage, useOnline, usePackFile } from '../media/usePack';
import { ScreenFrame } from './ScreenFrame';

// S10 — Key term detail (spec 10): text + audio + provenance (R-505, R-313). Opening never
// starts audio (R-407). Only source clips exist today; AI term narration is a marked slot (Bide).
export default function S10KeyTermDetail() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const packId = params.get('pack') ?? DEFAULT_PACK;
  const id = params.get('id') ?? '';
  const unit = params.get('unit');
  const fromResources = params.get('from') === 'resources';
  const lang = packLanguage(packId);
  const online = useOnline();
  const res = usePackFile<ResourcesPack>(packId, 'resources');
  const term = res.status === 'ready' ? findTerm(res.data, id) : undefined;
  const audioMark = markFor(term?.audio, 'audio');
  const choice = selectNarration('source-fallback', {
    source:
      term && audioMark === 'source' && term.audio.url
        ? { id: term.audio.sourceId ?? term.id, url: term.audio.url }
        : null,
    generated: null, // AI term narration: generated later server-side, always marked (L1 M11)
  });
  const clip = useClip(choice.clip?.url, choice.clip?.id ?? id);
  const back = () =>
    fromResources || !unit
      ? nav(`/resources?pack=${encodeURIComponent(packId)}${unit ? `&unit=${unit}` : ''}`)
      : nav(`/guide?pack=${encodeURIComponent(packId)}&unit=${unit}`);
  const openSheet = (domain: 'text' | 'audio') => {
    const state: ProvenanceSheetState = {
      domain,
      slot: domain === 'text' ? term?.text : term?.audio,
      englishShown: domain === 'text' && markFor(term?.text, 'text') === 'absent',
      typeKey: 'terms',
      language: languageName(lang),
    };
    nav(PROVENANCE_SHEET_PATH, { state });
  };
  const primary = !choice.clip
    ? null
    : clip.phase === 'playing'
      ? t('s.term.primary-pause')
      : clip.phase === 'paused'
        ? t('s.term.primary-resume')
        : clip.phase === 'finished'
          ? t('s.term.primary-again')
          : t('s.term.primary-play');
  const textMark = markFor(term?.text, 'text');
  return (
    <ScreenFrame
      id="S10"
      title={term?.title ?? t('s.common.loading')}
      offline={!online}
      primaryLabel={primary}
      primaryState={clip.phase === 'playing' ? 'playing' : 'default'}
      onPrimary={clip.toggle}
    >
      <SecondaryAction
        label={
          fromResources || !unit
            ? t('s.term.close-back-resources')
            : t('s.term.close-back', { n: unit })
        }
        onPress={back}
      />
      <p className="fia-caption">{t('s.term.kind')}</p>
      {res.status === 'error' && (
        <div role="alert">
          <p>{t('s.resources.error')}</p>
          <SecondaryAction label={t('s.common.try-again')} onPress={res.retry} />
        </div>
      )}
      {res.status === 'ready' && !term && (
        <div role="alert">
          <p>{t('s.resources.error')}</p>
        </div>
      )}
      {term && (
        <>
          <ProvenanceMark
            provenance={textMark}
            language={languageName(lang)}
            onInfo={() => openSheet('text')}
          />
          {textMark === 'absent' && <AbsentBadge language={languageName(lang)} />}
          <div className="fia-text fia-text--guide" dir="auto" lang={lang}>
            {htmlToParagraphs(term.text.html ?? '').map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {choice.clip ? (
            <AudioControls
              provenance={choice.mark}
              elapsedSec={clip.elapsed}
              totalSec={clip.duration}
              onSeek={clip.seek}
              onMarkInfo={() => openSheet('audio')}
              state={clip.playing ? 'playing' : clip.error ? 'error' : 'default'}
            />
          ) : (
            <ProvenanceMark
              provenance="absent"
              language={languageName(lang)}
              onInfo={() => openSheet('audio')}
            />
          )}
          {clip.error && <p role="alert">{t('s.term.error')}</p>}
        </>
      )}
    </ScreenFrame>
  );
}
