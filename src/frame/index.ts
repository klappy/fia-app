// The FIA shared app layer: the parts every glass screen composes, named after the nodded mocks'
// window.FIA (cookbook design/alpha-v2-screens/_frame.js:429-436), styled by one stylesheet
// (frame/frame.css, imported once in main.tsx). RULING 2026-10-02 ~20:05 ET: screens are compositions
// of kit + this layer; per-screen CSS is layout only. Kit parts arrive through components/glass.ts.
// Mock name → app part. Parts not listed here are still screen-local (see the PR's follow-ups).

// frames
export { ScreenFrame as Frame } from '../screens/ScreenFrame';
export { FiaLogo } from '../components/FiaLogo';
export { Header, LangPill, ExploreButton } from './Header';
export { LayerHead } from '../components/LayerHead';
// progress
export { ProgressBand, StickyStrip, CardViews, PartChips } from '../flow/ui/GuideChrome';
export { Bead, BeadStrip as BeadRow, StageRail as StageSegments } from '../components/glass';
export { BeadLegend, StatesKey, LegendWell } from './BeadLegend';
// card
export { GuideCard } from './GuideCard';
export { ProvenanceChip } from '../components/ProvenanceMark';
// buttons and transport
export { GuidePrimary, KitPrimary as Primary } from '../components/PrimaryButton';
export { QuietAction as Quiet } from '../components/QuietAction';
export { GuideTransport as Transport } from '../components/AudioControls';
// sheets
export { MoreSheet as ExploreSheet } from '../components/MoreSheet';
export { Sheet } from '../components/Sheet';
export { Group } from './Group';
// helpers
export { KINDS, kindColor } from './kinds';
export { NB, keepRef, keepNumber } from './text';
export { iconSz, readScale, useBig, useTextScale } from './scale';
