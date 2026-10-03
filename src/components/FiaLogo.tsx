import { t } from '../i18n';

// The FIA lockup (PRD § 8.4): official mark + wordmark. Paths are copied byte for byte by script from
// klappy/fia-functional-poc @62a979f src/components/FiaBrand.jsx:2-3 (fia.bible/about; hashes in the
// cookbook's evidence/b2/BRAND-SOURCES.json); never retype them. Geometry from the PoC header
// (src/styles/app.css:29): 22 px symbol · 6 px gap · 20 px wordmark, 1 px down. Colour: --fia-brand.
// role="img", name "FIA", never a button; it does not scale with text size.
const SYMBOL = [
  'M149.39 164.39c-3.47 0-6.93-1.32-9.57-3.97l-68-67.99c-5.29-5.29-5.29-13.86 0-19.15s13.86-5.29 19.15 0l44.46 44.46c7.71 7.71 20.21 7.71 27.92 0l44.46-44.46c5.29-5.29 13.86-5.29 19.15 0s5.29 13.86 0 19.15l-67.99 68a13.5 13.5 0 0 1-9.57 3.97Z',
  'M81.53 0C85 0 88.46 1.32 91.1 3.97l68 67.99c5.29 5.29 5.29 13.86 0 19.15s-13.86 5.29-19.15 0L95.49 46.65c-7.71-7.71-20.21-7.71-27.92 0L23.11 91.11c-5.29 5.29-13.86 5.29-19.15 0s-5.29-13.86 0-19.15l68-67.99A13.5 13.5 0 0 1 81.53 0M300 85.98c0 3.47-1.32 6.93-3.97 9.57l-67.99 67.99c-5.29 5.29-13.86 5.29-19.15 0s-5.29-13.86 0-19.15l44.46-44.46c7.71-7.71 7.71-20.21 0-27.92l-44.46-44.46c-5.29-5.29-5.29-13.86 0-19.15s13.86-5.29 19.15 0l67.99 67.99a13.5 13.5 0 0 1 3.97 9.57Z',
];
const WORDMARK = [
  'M8.33 0h77.14a8.33 8.33 0 0 1 0 16.66H26.28a8.33 8.33 0 0 0-8.33 8.33v33.34c0 4.6 3.73 8.33 8.33 8.33h53.85a8.33 8.33 0 0 1 0 16.66H26.28a8.33 8.33 0 0 0-8.33 8.33v51.28c0 4.6-3.73 8.33-8.33 8.33H8.34a8.33 8.33 0 0 1-8.33-8.33V8.33C0 3.73 3.73 0 8.33 0m119.45 0c4.96 0 8.97 4.02 8.97 8.97v133.34a8.98 8.98 0 0 1-8.98 8.98c-4.96 0-8.97-4.02-8.97-8.97V8.97c0-4.96 4.02-8.97 8.97-8.97ZM231.9 0c5.15 0 9.81 3.08 11.83 7.82l55.53 130.62c2.59 6.09-1.88 12.85-8.5 12.85h-.81c-3.74 0-7.1-2.25-8.53-5.7l-11.26-27.22a6.89 6.89 0 0 0-6.37-4.26h-66.45c-2.78 0-5.28 1.67-6.36 4.23l-11.45 27.29a9.24 9.24 0 0 1-8.52 5.66c-6.67 0-11.14-6.85-8.45-12.96L220.14 7.67C222.19 3.01 226.81 0 231.9 0m-6.96 37.91-21.1 49.96c-1.92 4.54 1.42 9.58 6.35 9.58h41.16c4.88 0 8.22-4.94 6.4-9.47l-20.1-49.96c-2.29-5.69-10.32-5.76-12.7-.11Z',
];

const S1 = 22 / 167.52;
const S2 = 20 / 151.29;
const SYM_W = 300 * S1;
const LOCK_W = SYM_W + 6 + 300 * S2;

/**
 * The lockup; `qualifier` sets the line under it (mock FiaLogo qualifier, design/alpha-v2-screens/_frame.js:77-78;
 * .fia-qualifier in frame/frame.css), as S01 and S15 show it. The parent lays the two out.
 */
export function FiaLogo({
  size = 22,
  qualifier,
  mark,
}: {
  size?: number;
  qualifier?: boolean;
  /** The symbol alone, no wordmark: the hub header's last-resort fit (Header.tsx `useOneRowHub`). */
  mark?: boolean;
}) {
  const w = mark ? SYM_W : LOCK_W;
  const svg = (
    <svg
      className="fia-logo"
      viewBox={`0 0 ${w.toFixed(2)} 22`}
      width={+((w * size) / 22).toFixed(2)}
      height={size}
      role="img"
      aria-label="FIA"
    >
      <title>FIA</title>
      <g fill="currentColor">
        <g transform={`scale(${S1.toFixed(6)})`}>
          {SYMBOL.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        {!mark && (
          <g transform={`translate(${(SYM_W + 6).toFixed(3)} 1) scale(${S2.toFixed(6)})`}>
            {WORDMARK.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        )}
      </g>
    </svg>
  );
  if (!qualifier) return svg;
  return (
    <>
      {svg}
      <p className="fia-qualifier">{t('s.about.qualifier')}</p>
    </>
  );
}
