import type { ReactNode } from 'react';
import { Bead, BeadStrip, GlassSurface, StageRail } from '../components/glass';
import type { BeadKind } from '../flow/ui/band';
import { t } from '../i18n';
import { KINDS } from './kinds';

// "What the marks mean": the mock's BeadLegend + StatesKey in a well (cookbook
// design/alpha-v2-screens/_frame.js:363-394; .fia-legend* in frame/frame.css). Lifted from S07's private
// Legend so S07, S15 and Explore can draw one key. Kinds this guide draws, the band's two marks (a step
// segment and a stretch capsule), then the four states.

const LEGEND: { kind: BeadKind; key: string }[] = [
  { kind: 'plain', key: 's.legend.plain' },
  { kind: 'scripture', key: 's.legend.scripture' },
  { kind: 'term', key: 's.legend.term' },
  { kind: 'media', key: 's.legend.media' },
  { kind: 'stop', key: 's.legend.stop' },
  { kind: 'end', key: 's.legend.end' },
];

/** Bead size: 10 px × min(scale, 2.4) (mock k(), _frame.js:42). */
const beadSize = (scale: number) => 10 * Math.min(scale, 2.4);

export interface BeadLegendProps {
  /** The kinds this guide draws (others are left out). */
  kinds: ReadonlySet<BeadKind>;
  /** Steps in the guide ("A step (6 in all)"). */
  steps: number;
  /** Text scale (1, 1.5, 2, 3.1). */
  scale: number;
}

/** The kinds grid (mock BeadLegend). */
export function BeadLegend({ kinds, steps, scale }: BeadLegendProps) {
  const b = beadSize(scale);
  const item = (key: string, mark: ReactNode, words: string) => (
    <div key={key} className="fia-legend-item" role="listitem">
      <span className="fia-legend-mark" aria-hidden="true">
        {mark}
      </span>
      <span>{words}</span>
    </div>
  );
  return (
    <div className="fia-legend" role="list">
      {LEGEND.filter((l) => kinds.has(l.kind)).map((l) =>
        item(l.kind, <Bead kind={l.kind} kinds={KINDS} state="done" size={b} />, t(l.key)),
      )}
      {item(
        'step',
        <StageRail
          className="fia-rail__steps fia-legend-seg"
          stages={[{ title: '' }]}
          current={0}
          progress={0.5}
          height={6 * Math.min(scale, 1.67)}
        />,
        t('s.legend.step', { n: steps }),
      )}
      {item('stretch', <BeadStrip items={[]} after={1} size={b} />, t('s.legend.stretch'))}
    </div>
  );
}

/** heard · ahead · you are here · more inside (mock StatesKey). */
export function StatesKey({ scale }: { scale: number }) {
  const b = beadSize(scale);
  const state = (key: string, mark: ReactNode, words: string) => (
    <span key={key} className="fia-legend-state">
      <span aria-hidden="true">{mark}</span>
      {words}
    </span>
  );
  return (
    <div className="fia-legend-states">
      {state(
        'heard',
        <Bead kind="term" kinds={KINDS} state="done" size={b} />,
        t('s.legend.state.heard'),
      )}
      {state(
        'ahead',
        <Bead kind="term" kinds={KINDS} state="upcoming" size={b} />,
        t('s.legend.state.ahead'),
      )}
      {state(
        'here',
        <Bead kind="term" kinds={KINDS} state="current" size={7 * Math.min(scale, 2.4)} />,
        t('s.legend.state.here'),
      )}
      {state(
        'more',
        <Bead kind="term" kinds={KINDS} state="done" size={b} more />,
        t('s.legend.state.more'),
      )}
    </div>
  );
}

/** The key in its well, titled (mock ExploreSheet legend, _frame.js:393-394). */
export function LegendWell({ id = 'fia-legend-title', ...p }: BeadLegendProps & { id?: string }) {
  return (
    <GlassSurface
      level={3}
      blur="soft"
      radius="xl"
      shadow="none"
      className="fia-well fia-legend-well"
      role="group"
      aria-labelledby={id}
    >
      <div className="fia-legend-inner">
        <div className="fia-legend-title" id={id}>
          {t('s.legend.title')}
        </div>
        <BeadLegend {...p} />
        <StatesKey scale={p.scale} />
      </div>
    </GlassSurface>
  );
}
