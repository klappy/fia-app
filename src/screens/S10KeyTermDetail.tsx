import { useNavigate, useSearchParams } from 'react-router-dom';
import { AudioControls, LayerHead } from '../components';
import { GlassButton, GlassSurface, Icon } from '../components/glass';
import { ProvenanceChip } from '../components/ProvenanceMark';
import { iconSize, useTextScale } from '../flow/ui/guideKit';
import { t } from '../i18n';
import { languageName } from '../media/lang';
import { markWords } from '../media/marks';
import { markFor, selectNarration } from '../media/provenance';
import { findTerm, htmlToParagraphs, type ResourcesPack } from '../media/resources';
import { PROVENANCE_SHEET_PATH, type ProvenanceSheetState } from '../media/sheet';
import { useClip } from '../media/useClip';
import { DEFAULT_PACK, packLanguage, useOnline, usePackFile } from '../media/usePack';
import { ScreenFrame } from './ScreenFrame';

// S10 — Key term detail (spec 10): text + audio + provenance (R-505, R-313). Opening never
// starts audio (R-407). Only source clips exist today; AI term narration is a marked slot (Bide).
// F6-S10 glass (nodded mock design/alpha-v2-screens/10-key-term.html, Layer frame): the way back
// in the glass header (ScreenFrame `close`), the term set large led by its ◆ bead with the kind
// line under it (LayerHead), the marks as ProvenanceChips (kit GlassChip → sheet 20), the
// definition on one kit GlassSurface card, then the time line above the one primary. Composed
// only from the kit and the shared app layer; this screen adds no CSS (RULING ~20:05 ET).
export default function S10KeyTermDetail() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const scale = useTextScale();
  const packId = params.get('pack') ?? DEFAULT_PACK;
  const id = params.get('id') ?? '';
  const unit = params.get('unit');
  const fromResources = params.get('from') === 'resources';
  const lang = packLanguage(packId);
  const language = languageName(lang);
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
      language,
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
  const audioShown = choice.clip ? choice.mark : 'absent';
  return (
    <ScreenFrame
      id="S10"
      title={term?.title ?? t('s.common.loading')}
      titleHidden={!!term}
      close={{
        label:
          fromResources || !unit
            ? t('s.term.close-back-resources')
            : t('s.term.close-back', { n: unit }),
        onPress: back,
      }}
      offline={!online}
      primaryLabel={primary}
      primaryState={clip.phase === 'playing' ? 'playing' : 'default'}
      onPrimary={clip.toggle}
    >
      {res.status === 'error' && (
        <GlassSurface level={2} blur="medium" radius="lg" shadow="rest" className="fia-layer-card">
          <div role="alert">
            <p>{t('s.resources.error')}</p>
            <GlassButton
              variant="glass"
              leading={<Icon name="update" size={iconSize(18, scale)} />}
              onClick={res.retry}
            >
              {t('s.common.try-again')}
            </GlassButton>
          </div>
        </GlassSurface>
      )}
      {res.status === 'ready' && !term && (
        <GlassSurface level={2} blur="medium" radius="lg" shadow="rest" className="fia-layer-card">
          <p role="alert">{t('s.resources.error')}</p>
        </GlassSurface>
      )}
      {term && (
        <>
          <LayerHead
            kind="term"
            beadOn="title"
            kindLine={t('s.term.kind')}
            title={term.title}
            scale={scale}
          />
          <div className="fia-chips">
            <ProvenanceChip
              provenance={textMark}
              words={
                textMark === 'absent'
                  ? t('s.term.english-fallback', { language })
                  : markWords(textMark, language)
              }
              iconSize={iconSize(14, scale)}
              onInfo={() => openSheet('text')}
            />
            {/* one chip when text and recording carry the same mark (mock: one chip); else both */}
            {audioShown !== textMark && (
              <ProvenanceChip
                provenance={audioShown}
                words={markWords(audioShown, language)}
                iconSize={iconSize(14, scale)}
                onInfo={() => openSheet('audio')}
              />
            )}
          </div>
          <GlassSurface
            level={2}
            blur="medium"
            radius="lg"
            shadow="rest"
            className="fia-layer-card fia-text fia-text--guide"
            dir="auto"
            lang={lang}
          >
            {htmlToParagraphs(term.text.html ?? '').map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </GlassSurface>
          {choice.clip && (
            <AudioControls
              className="fia-layer-audio"
              hideMark
              provenance={choice.mark}
              elapsedSec={clip.elapsed}
              totalSec={clip.duration}
              onSeek={clip.seek}
              state={clip.playing ? 'playing' : clip.error ? 'error' : 'default'}
            />
          )}
          {clip.error && <p role="alert">{t('s.term.error')}</p>}
        </>
      )}
    </ScreenFrame>
  );
}
