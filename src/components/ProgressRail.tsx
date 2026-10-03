import { BeadStrip, StageRail } from './glass';
import { stateAttrs, type StateProps } from './types';

// progress-rail (PRD § 3 app-owned, § 8.3), v2: the kit's progress/StageRail (overall: one segment per
// step) and progress/BeadStrip (scoped: coded beads for this section, capsules for the step's other
// sections). Kind is shape and colour, state is fill (never opacity); colours are the app's
// --fia-kind-* tokens (contrast variants of the kit's). Display only: nothing here is tappable.
export type RailBeadKind = 'plain' | 'scripture' | 'term' | 'media' | 'video' | 'stop' | 'end';

export interface RailBead {
  kind: RailBeadKind;
  state: 'done' | 'current' | 'upcoming';
  more?: boolean;
}

export interface ProgressRailProps extends StateProps {
  steps: { title: string }[];
  /** index of the current step; `steps.length` = every step done */
  currentStep: number;
  /** fill of the current step's segment, 0..1 */
  progress: number;
  beads?: RailBead[];
  /** capsules: sections before and after this one */
  before?: number;
  after?: number;
  /** accessible names: the step rail and the bead strip */
  stepsLabel: string;
  beadsLabel?: string;
  /** text scale (1, 1.5, 2, 3.1): beads are 10 px × min(scale, 2.4) (mock _frame.js:42) */
  scale?: number;
}

const KINDS = {
  plain: { shape: 'circle', color: 'var(--fia-kind-plain)' },
  scripture: { shape: 'square', color: 'var(--fia-kind-scripture)' },
  term: { shape: 'diamond', color: 'var(--fia-kind-term)' },
  media: { shape: 'triangle', color: 'var(--fia-kind-media)' },
  video: { shape: 'screen', color: 'var(--fia-kind-media)' },
  stop: { shape: 'bar', color: 'var(--fia-kind-stop)' },
  end: { shape: 'bars', color: 'var(--fia-kind-stop)' },
} as const;

export function ProgressRail({
  steps,
  currentStep,
  progress,
  beads,
  before = 0,
  after = 0,
  stepsLabel,
  beadsLabel,
  scale = 1,
  state = 'default',
  className,
}: ProgressRailProps) {
  return (
    <div className={['fia-rail', className].filter(Boolean).join(' ')} {...stateAttrs(state)}>
      <StageRail
        className="fia-rail__steps"
        stages={steps}
        current={currentStep}
        progress={progress}
        height={6 * Math.min(scale, 1.67)}
        label={stepsLabel}
      />
      {beads && (
        <BeadStrip
          className="fia-rail__beads"
          items={beads}
          before={before}
          after={after}
          size={10 * Math.min(scale, 2.4)}
          gap={6 * Math.min(scale, 2)}
          kinds={KINDS}
          label={beadsLabel}
        />
      )}
    </div>
  );
}
