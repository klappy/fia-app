import { stateAttrs, type StateProps } from './types';

// progress-rail.md — stage rail (guide level, six stages) + step beads (unit level).
export interface ProgressRailProps extends StateProps {
  stages: string[];
  currentStage: number;
  units?: number;
  currentUnit?: number;
  /** unit indexes marked skipped (bead style) */
  skipped?: number[];
}

export function ProgressRail({
  stages,
  currentStage,
  units = 0,
  currentUnit = 0,
  skipped = [],
  state = 'default',
  className,
}: ProgressRailProps) {
  return (
    <div className={['fia-rail', className].filter(Boolean).join(' ')} {...stateAttrs(state)}>
      <ol className="fia-rail__stages" aria-label="Stages">
        {stages.map((s, i) => (
          <li
            key={s}
            aria-current={i === currentStage ? 'step' : undefined}
            data-done={i < currentStage || undefined}
          >
            {s}
          </li>
        ))}
      </ol>
      {units > 0 && (
        <ol className="fia-rail__beads" aria-label="Units">
          {Array.from({ length: units }, (_, i) => (
            <li
              key={i}
              aria-current={i === currentUnit ? 'step' : undefined}
              data-done={i < currentUnit || undefined}
              data-skipped={skipped.includes(i) || undefined}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
